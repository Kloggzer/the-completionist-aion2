using System.Drawing.Imaging;
using System.IO.Compression;
using System.Text.Json;

namespace PetOverlay;

// Coloured top-down map ("Karte" style) from aion2maps' voxel chunks (maps/<key>/vox/<lod>/<cx>_<cz>.bin, the same
// blocks their 3D view draws): per cell the colour of the highest top face (terrain, rock, buildings, trees, water)
// with its ambient occlusion, plus a hill shade and cast shadows from the surface heights, lit from the top left
// of the screen (north-west), and faint contour lines. Row = z, column = x, like the relief; the image covers the
// voxel grid (x0 .. x0 + nch * chunk_m on both axes).
static class TerrainArt
{
    public const string File = "terrain-v1.jpg"; // bump the version when the look changes, so cached renders are redone
    public const int MaxPx = 4096;

    public record Grid(double X0, double Off, double ChunkM, int Nch, double Block, int Cells, string Lod, List<(int cx, int cz)> Chunks);

    /// <summary>The finest level of detail at or above 4 m (or the coarsest there is) and its chunk list; null without voxels.</summary>
    public static Grid? ReadGrid(string indexPath)
    {
        using var doc = JsonDocument.Parse(System.IO.File.ReadAllText(indexPath));
        var r = doc.RootElement;
        if (!r.TryGetProperty("lods", out var lods)) return null;
        string? best = null; double bestB = 0;
        foreach (var p in lods.EnumerateObject())
        {
            double b = p.Value.GetProperty("block_m").GetDouble();
            bool better = best == null || (b >= 4 && (bestB < 4 || b < bestB)) || (b < 4 && bestB < 4 && b > bestB);
            if (better) { best = p.Name; bestB = b; }
        }
        if (best == null) return null;
        var lod = lods.GetProperty(best);
        var chunks = lod.GetProperty("chunks").EnumerateArray()
            .Where(c => !c.TryGetProperty("q", out var q) || q.GetInt32() > 0)
            .Select(c => (c.GetProperty("c")[0].GetInt32(), c.GetProperty("c")[1].GetInt32())).ToList();
        return new Grid(r.GetProperty("x0").GetDouble(), r.TryGetProperty("off", out var o) ? o.GetDouble() : 0,
            r.GetProperty("chunk_m").GetDouble(), r.GetProperty("nch").GetInt32(), bestB, lod.GetProperty("cells_per_chunk").GetInt32(), best, chunks);
    }

    public static void Render(string indexPath, Grid g, Func<int, int, string?> chunkPath, string outPath)
    {
        using var doc = JsonDocument.Parse(System.IO.File.ReadAllText(indexPath));
        var root = doc.RootElement;
        var pal = new List<(float r, float g, float b)>();
        foreach (var c in root.GetProperty("palette").EnumerateArray()) pal.Add((c[0].GetSingle(), c[1].GetSingle(), c[2].GetSingle()));
        var water = new List<(float r, float g, float b)>();
        if (root.TryGetProperty("water", out var w) && w.TryGetProperty("rgb", out var wr))
            foreach (var c in wr.EnumerateArray()) water.Add((c[0].GetSingle(), c[1].GetSingle(), c[2].GetSingle()));
        if (water.Count == 0) water.Add((48, 128, 172));

        int n = g.Nch * g.Cells;                              // cells per side
        int S = Math.Clamp(MaxPx / n, 1, 2);                  // pixels per cell
        int P = n * S;
        var lvl = new short[n * n]; Array.Fill(lvl, short.MinValue);
        var col = new byte[n * n];                            // palette index, >= 240 water
        var ao = new float[n * n];                            // 0..1 (AO 0..3 interpolated over the quad, at the cell centre)

        foreach (var (cx, cz) in g.Chunks)
        {
            var path = chunkPath(cx, cz);
            if (path == null) continue;
            byte[] d;
            using (var z = new ZLibStream(System.IO.File.OpenRead(path), CompressionMode.Decompress))
            using (var ms = new MemoryStream()) { z.CopyTo(ms); d = ms.ToArray(); }
            int cnt = BitConverter.ToInt32(d, 0), o = 4;
            int oX = o, oZ = oX + cnt, oY = oZ + cnt, oW = oY + 2 * cnt, oH = oW + cnt, oF = oH + cnt, oC = oF + cnt, oA = oC + cnt;
            for (int i = 0; i < cnt; i++)
            {
                int f = d[oF + i];
                if ((f & 7) != 2 || (f & 64) != 0) continue;   // top faces (+y) only; "under" faces are hidden in the 3D view too
                int y = BitConverter.ToInt16(d, oY + 2 * i);
                int x0 = cx * g.Cells + d[oX + i], z0 = cz * g.Cells + d[oZ + i];
                int ww = d[oW + i], hh = d[oH + i];             // +y face: w runs along z, h along x
                int a = d[oA + i], a0 = a & 3, a1 = a >> 2 & 3, a2 = a >> 4 & 3, a3 = a >> 6 & 3; // corners (x,z) (x,z+w) (x+h,z+w) (x+h,z)
                for (int zz = Math.Max(z0, 0); zz < Math.Min(z0 + ww, n); zz++)
                for (int xx = Math.Max(x0, 0); xx < Math.Min(x0 + hh, n); xx++)
                {
                    int ci = zz * n + xx;
                    if (y < lvl[ci]) continue;
                    lvl[ci] = (short)y; col[ci] = d[oC + i];
                    float u = (xx - x0 + 0.5f) / hh, v = (zz - z0 + 0.5f) / ww;
                    ao[ci] = ((1 - u) * (1 - v) * a0 + (1 - u) * v * a1 + u * v * a2 + u * (1 - v) * a3) / 3;
                }
            }
        }

        // Surface heights (m) per cell; void columns count as sea level.
        var h = new float[n * n];
        for (int i = 0; i < h.Length; i++) h[i] = lvl[i] == short.MinValue ? 0 : (float)(lvl[i] * g.Block);
        var hs = Blur(Blur(h, n), n);                          // softened for the hill shade and contours

        // Light from the screen's top left (-x, -z), 38° above the horizon.
        const float elev = 38f * MathF.PI / 180f;
        float lx = -MathF.Cos(elev) * 0.7071f, lz = lx, ly = MathF.Sin(elev);
        float tanE = MathF.Tan(elev), blk = (float)g.Block;
        var shade = new float[n * n];
        Parallel.For(0, n, r =>
        {
            for (int c = 0; c < n; c++)
            {
                int i = r * n + c;
                float dx = (hs[r * n + Math.Min(c + 1, n - 1)] - hs[r * n + Math.Max(c - 1, 0)]) / (2 * blk);
                float dz = (hs[Math.Min(r + 1, n - 1) * n + c] - hs[Math.Max(r - 1, 0) * n + c]) / (2 * blk);
                float nl = MathF.Sqrt(dx * dx + dz * dz + 1);
                float ndl = Math.Max((-dx * lx - dz * lz + ly) / nl, 0) / ly; // 1 on flat ground
                // cast shadow: march towards the light over the raw heights
                float h0 = h[i], sh = 0;
                for (int k = 1; k < 90; k++)
                {
                    int rr = r - (int)(k * 0.7071f + 0.5f), cc = c - (int)(k * 0.7071f + 0.5f);
                    if (rr < 0 || cc < 0) break;
                    float rise = h[rr * n + cc] - (h0 + k * blk * tanE);
                    if (rise > 0) { sh = Math.Max(sh, Math.Min(1, rise / (2 + k * blk * 0.08f))); if (sh >= 1) break; }
                }
                shade[i] = (0.5f + 0.62f * Math.Min(ndl, 1.6f)) * (1 - 0.34f * sh);
            }
        });
        shade = Blur(shade, n);

        var px = new int[P * P];
        Parallel.For(0, P, pr =>
        {
            for (int pc = 0; pc < P; pc++)
            {
                // bilinear cell coordinates of this pixel's centre
                float fx = (pc + 0.5f) / S - 0.5f, fz = (pr + 0.5f) / S - 0.5f;
                int c = Math.Clamp((int)(fx + 0.5f), 0, n - 1), r = Math.Clamp((int)(fz + 0.5f), 0, n - 1), i = r * n + c;
                float lit = Bilerp(shade, n, fx, fz);
                float a = Bilerp(ao, n, fx, fz);
                float aoF = 0.74f + 0.26f * (a * a * (3 - 2 * a));
                float cr, cg, cb;
                if (lvl[i] == short.MinValue) { cr = 26; cg = 50; cb = 72; aoF = 1; lit = 1; }
                else if (col[i] >= 240)
                {
                    (cr, cg, cb) = water[Math.Min(col[i] - 240, water.Count - 1)];
                    // calmer water: only the cast shadows of the coast, a lighter rim at the shore
                    lit = 0.82f + 0.18f * Math.Min(lit, 1.1f);
                    if (NearLand(lvl, col, n, r, c)) { cr = cr * 0.7f + 230 * 0.3f; cg = cg * 0.7f + 240 * 0.3f; cb = cb * 0.7f + 235 * 0.3f; }
                    cr *= 0.78f; cg *= 0.8f; cb *= 0.84f;
                    aoF = 1;
                }
                else
                {
                    (cr, cg, cb) = pal[Math.Min(col[i], pal.Count - 1)];
                    float j = 1 + (Hash(c, r) - 0.5f) * 0.07f; // per-block tint jitter
                    cr *= j; cg *= j; cb *= j;
                    // contour every 25 m, faint
                    float hv = Bilerp(hs, n, fx, fz);
                    float hx = Bilerp(hs, n, fx + 1f / S, fz), hz = Bilerp(hs, n, fx, fz + 1f / S);
                    if ((int)MathF.Floor(hv / 25f) != (int)MathF.Floor(hx / 25f) || (int)MathF.Floor(hv / 25f) != (int)MathF.Floor(hz / 25f)) lit *= 0.93f;
                }
                // a little calmer than the 3D view, so the coloured markers on top stay readable
                float m = lit * aoF * 0.88f, lum = 0.3f * cr + 0.59f * cg + 0.11f * cb;
                cr += (lum - cr) * 0.15f; cg += (lum - cg) * 0.15f; cb += (lum - cb) * 0.15f;
                px[pr * P + pc] = unchecked((int)0xFF000000) | Tone(cr * m) << 16 | Tone(cg * m) << 8 | Tone(cb * m);
            }
        });

        using var bmp = new Bitmap(P, P, PixelFormat.Format32bppArgb);
        var data = bmp.LockBits(new Rectangle(0, 0, P, P), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        System.Runtime.InteropServices.Marshal.Copy(px, 0, data.Scan0, px.Length);
        bmp.UnlockBits(data);
        Directory.CreateDirectory(Path.GetDirectoryName(outPath)!);
        var enc = ImageCodecInfo.GetImageEncoders().First(e => e.FormatID == ImageFormat.Jpeg.Guid);
        using var ep = new EncoderParameters(1);
        ep.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 88L);
        bmp.Save(outPath + ".tmp", enc, ep);
        System.IO.File.Move(outPath + ".tmp", outPath, true);
    }

    // Soft highlight roll-off instead of hard clipping.
    static int Tone(float v) => v <= 200 ? (int)Math.Max(v, 0) : (int)Math.Min(255, 200 + 55 * (1 - MathF.Exp(-(v - 200) / 55)));

    static float Hash(int x, int z)
    {
        uint s = (uint)(x * 374761393 + z * 668265263);
        s = (s ^ (s >> 13)) * 1274126177;
        return ((s ^ (s >> 16)) & 0xFFFF) / 65535f;
    }

    static bool NearLand(short[] lvl, byte[] col, int n, int r, int c)
    {
        for (int dr = -1; dr <= 1; dr++)
        for (int dc = -1; dc <= 1; dc++)
        {
            int rr = r + dr, cc = c + dc;
            if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
            int i = rr * n + cc;
            if (lvl[i] != short.MinValue && col[i] < 240) return true;
        }
        return false;
    }

    static float Bilerp(float[] a, int n, float x, float z)
    {
        x = Math.Clamp(x, 0, n - 1); z = Math.Clamp(z, 0, n - 1);
        int x0 = Math.Min((int)x, n - 2), z0 = Math.Min((int)z, n - 2);
        float u = x - x0, v = z - z0;
        int i = z0 * n + x0;
        return (a[i] * (1 - u) + a[i + 1] * u) * (1 - v) + (a[i + n] * (1 - u) + a[i + n + 1] * u) * v;
    }

    // 3 × 3 box blur.
    static float[] Blur(float[] a, int n)
    {
        var t = new float[a.Length]; var o = new float[a.Length];
        Parallel.For(0, n, r =>
        {
            for (int c = 0; c < n; c++)
                t[r * n + c] = (a[r * n + Math.Max(c - 1, 0)] + a[r * n + c] + a[r * n + Math.Min(c + 1, n - 1)]) / 3;
        });
        Parallel.For(0, n, r =>
        {
            for (int c = 0; c < n; c++)
                o[r * n + c] = (t[Math.Max(r - 1, 0) * n + c] + t[r * n + c] + t[Math.Min(r + 1, n - 1) * n + c]) / 3;
        });
        return o;
    }
}
