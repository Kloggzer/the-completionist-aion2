using System.Drawing.Imaging;
using System.IO.Compression;
using System.Text.Json;

namespace PetOverlay;

// Game data (aion2maps.com format), cached under %LocalAppData%\TheCompletionist\cache and served to the UI as /data/.
// A snapshot ships inside the exe, so the app runs fully offline; online refresh from aion2maps is optional.
static class GameData
{
    public static bool Online { get; set; } = true;
    const string Base = "https://aion2maps.com/map/assets/";
    public static string CacheDir { get; } = Path.Combine(Settings.DataDir, "cache");
    static readonly HttpClient http = new(new HttpClientHandler { AutomaticDecompression = System.Net.DecompressionMethods.All }) { Timeout = TimeSpan.FromSeconds(30) };
    static readonly SemaphoreSlim gate = new(1, 1);

    static GameData() =>
        http.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) TheCompletionist/1.0");

    // Optional character lookup (UI: features/progress/plaync.ts): NCSOFT's public character search website, fetched
    // here because the search API rejects foreign origins and the detail API sends no CORS headers. Only these hosts.
    public static async Task<(int Status, string? Body)> PlayNc(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var u) || u.Scheme != Uri.UriSchemeHttps
            || u.Host is not ("api-search.plaync.com" or "aion2.plaync.com")) return (0, null);
        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
            using var r = await http.GetAsync(u, cts.Token);
            return ((int)r.StatusCode, await r.Content.ReadAsStringAsync(cts.Token));
        }
        catch { return (0, null); }
    }

    // Fresh copy if older than maxAge, else the cache; a failed download falls back to the cache.
    static async Task<string?> Fetch(string rel, TimeSpan maxAge, bool force = false)
    {
        var path = Path.Combine(CacheDir, rel.Replace('/', Path.DirectorySeparatorChar));
        if (!Online) return File.Exists(path) ? path : null;
        if (!force && File.Exists(path) && DateTime.Now - File.GetLastWriteTime(path) < maxAge) return path;
        try
        {
            var bytes = await http.GetByteArrayAsync(Base + rel);
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            await File.WriteAllBytesAsync(path + ".tmp", bytes);
            File.Move(path + ".tmp", path, true);
        }
        catch when (File.Exists(path)) { }
        catch { return null; }
        return path;
    }

    // Unpack the bundled snapshot for every file the cache does not have yet (first start, or a fresh cache).
    static void Seed()
    {
        using var res = typeof(GameData).Assembly.GetManifestResourceStream("snapshot.zip");
        if (res == null) return;
        using var zip = new ZipArchive(res, ZipArchiveMode.Read);
        foreach (var e in zip.Entries)
        {
            var path = Path.Combine(CacheDir, e.FullName.Replace('/', Path.DirectorySeparatorChar));
            if (e.Name.Length == 0 || File.Exists(path)) continue;
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            e.ExtractToFile(path);
            File.SetLastWriteTime(path, e.LastWriteTime.DateTime); // keeps the snapshot's age, so an online refresh can replace it
        }
    }

    public static async Task<bool> EnsureBase(bool force = false)
    {
        await gate.WaitAsync();
        try
        {
            try { Seed(); } catch { }
            var day = TimeSpan.FromDays(1);
            await Fetch("timers.json", day, force); // optional: only the timer tab needs it
            await Fetch("mon_portraits.webp", TimeSpan.FromDays(7), force); // optional: mob/boss portraits (atlas 16 × 128 px)
            return await Fetch("pets.json", day, force) != null & await Fetch("maps/index.json", day, force) != null;
        }
        finally { gate.Release(); }
    }

    public static async Task<bool> EnsureMap(string key, bool force = false)
    {
        if (key.Any(c => !char.IsLetterOrDigit(c) && c != '_')) return false;
        await gate.WaitAsync();
        try
        {
            var week = TimeSpan.FromDays(7);
            bool ok = await Fetch($"maps/{key}/monsters.json", week, force) != null
                    & await Fetch($"maps/{key}/mapdata.json", week, force) != null;
            var relief = Path.Combine(CacheDir, "maps", key, "relief.png");
            if ((!File.Exists(relief) || force) && Online)
            {
                var idx = await Fetch($"maps/{key}/vox/index.json", week, force);
                var tops = await Fetch($"maps/{key}/vox/tops4.bin", week, force);
                if (idx != null && tops != null) await Task.Run(() => RenderRelief(idx, tops, relief));
            }
            return ok;
        }
        catch { return false; }
        finally { gate.Release(); }
    }

    static readonly SemaphoreSlim artGate = new(1, 1);

    // Coloured map (TerrainArt) of a world map: one-time download of its voxel chunks (~15 MB for a big map, kept in
    // the cache for re-renders), rendered once to maps/<key>/terrain-v*.jpg. Own lock, so map data loads meanwhile.
    public static async Task<string?> EnsureTerrain(string key, bool force = false)
    {
        if (key.Any(c => !char.IsLetterOrDigit(c) && c != '_')) return null;
        await artGate.WaitAsync();
        try
        {
            var outPath = Path.Combine(CacheDir, "maps", key, TerrainArt.File);
            if (File.Exists(outPath) && !force) return TerrainArt.File;
            var idx = await Fetch($"maps/{key}/vox/index.json", TimeSpan.FromDays(7), force);
            var g = idx == null ? null : TerrainArt.ReadGrid(idx);
            if (g == null) return null;
            var paths = new string?[g.Chunks.Count];
            using (var limit = new SemaphoreSlim(8))
                await Task.WhenAll(g.Chunks.Select(async (c, i) =>
                {
                    await limit.WaitAsync();
                    try { paths[i] = await Fetch($"maps/{key}/vox/{g.Lod}/{c.cx}_{c.cz}.bin", TimeSpan.FromDays(30)); }
                    finally { limit.Release(); }
                }));
            if (paths.Any(p => p == null)) return null; // incomplete (offline): keep the relief, try again next time
            var byChunk = g.Chunks.Select((c, i) => (c, p: paths[i]!)).ToDictionary(x => x.c, x => x.p);
            await Task.Run(() => TerrainArt.Render(idx!, g, (cx, cz) => byChunk.GetValueOrDefault((cx, cz)), outPath));
            return TerrainArt.File;
        }
        catch { return null; }
        finally { artGate.Release(); }
    }

    // Hill-shaded top-down map from the voxel surface heights (4 m grid, row = z, col = x).
    static void RenderRelief(string indexPath, string topsPath, string outPath)
    {
        using var doc = JsonDocument.Parse(File.ReadAllText(indexPath));
        var root = doc.RootElement;
        var tops = root.GetProperty("tops");
        int n = tops.GetProperty("n").GetInt32();
        double block = tops.GetProperty("block_m").GetDouble();
        bool i16 = tops.TryGetProperty("dtype", out var dt) && dt.GetString() == "int16";

        using var z = new ZLibStream(File.OpenRead(topsPath), CompressionMode.Decompress);
        using var ms = new MemoryStream();
        z.CopyTo(ms);
        var raw = ms.ToArray();
        var h = new float[n * n];
        for (int i = 0; i < h.Length; i++)
            h[i] = (i16 ? BitConverter.ToInt16(raw, i * 2) : (sbyte)raw[i]) * (float)block;
        float sea = 0.5f;

        using var bmp = new Bitmap(n, n, PixelFormat.Format32bppArgb);
        var data = bmp.LockBits(new Rectangle(0, 0, n, n), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        var px = new int[n * n];
        float max = h.Max();
        for (int r = 0; r < n; r++)
        for (int c = 0; c < n; c++)
        {
            int i = r * n + c;
            float v = h[i];
            if (v < sea)
            {
                // Water: darker with distance to the shore is too costly; tint by depth below sea level instead.
                float d = Math.Clamp(-v / 40f, 0, 1);
                px[i] = Argb(255, (int)(28 - 10 * d), (int)(52 - 14 * d), (int)(74 - 16 * d));
                continue;
            }
            float dx = h[r * n + Math.Min(c + 1, n - 1)] - h[r * n + Math.Max(c - 1, 0)];
            float dz = h[Math.Min(r + 1, n - 1) * n + c] - h[Math.Max(r - 1, 0) * n + c];
            // Light from the north-west.
            float shade = Math.Clamp(0.78f + (-dx - dz) * 0.022f, 0.35f, 1.25f);
            float t = Math.Clamp(v / Math.Max(60f, max), 0, 1);
            var (cr, cg, cb) = Ramp(t);
            px[i] = Argb(255, (int)Math.Clamp(cr * shade, 0, 255), (int)Math.Clamp(cg * shade, 0, 255), (int)Math.Clamp(cb * shade, 0, 255));
        }
        System.Runtime.InteropServices.Marshal.Copy(px, 0, data.Scan0, px.Length);
        bmp.UnlockBits(data);
        Directory.CreateDirectory(Path.GetDirectoryName(outPath)!);
        bmp.Save(outPath, ImageFormat.Png);
    }

    static int Argb(int a, int r, int g, int b) => a << 24 | r << 16 | g << 8 | b;

    // Muted hypsometric tint that stays readable under bright markers.
    static (float, float, float) Ramp(float t)
    {
        (float t, float r, float g, float b)[] stops =
        [
            (0f, 70, 86, 62), (0.15f, 82, 98, 64), (0.35f, 104, 106, 72), (0.6f, 118, 108, 86), (0.85f, 132, 128, 120), (1f, 168, 168, 166),
        ];
        for (int i = 1; i < stops.Length; i++)
            if (t <= stops[i].t)
            {
                var (a, b) = (stops[i - 1], stops[i]);
                float f = (t - a.t) / (b.t - a.t);
                return (a.r + (b.r - a.r) * f, a.g + (b.g - a.g) * f, a.b + (b.b - a.b) * f);
            }
        return (stops[^1].r, stops[^1].g, stops[^1].b);
    }
}
