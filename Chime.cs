using System.Media;

namespace PetOverlay;

// Short synthesized notification sounds (no sound files): a two-note call for timer announcements and the
// "pling – pling – plong" start signal.
static class Chime
{
    public static void Timer() => Play([(880, 160), (0, 60), (1319, 260)]);      // A5 – E6
    public static void Pling() => Play([(1760, 140)], 0.35);                       // A6: 2 s and 1 s before the start
    public static void Plong() => Play([(880, 120), (1319, 520)], 0.4);            // A5 E6: the start itself

    static void Play((int hz, int ms)[] notes, double volume = 0.35)
    {
        const int rate = 44100;
        var samples = new List<short>();
        foreach (var (hz, ms) in notes)
        {
            int n = rate * ms / 1000;
            for (int i = 0; i < n; i++)
            {
                // Short attack, exponential decay: a bell-like tone instead of a harsh beep.
                double env = Math.Min(1, i / (rate * 0.005)) * Math.Exp(-3.0 * i / n);
                double v = hz == 0 ? 0 : Math.Sin(2 * Math.PI * hz * i / rate) * env * volume;
                samples.Add((short)(v * short.MaxValue));
            }
        }
        var wav = new MemoryStream();
        using (var w = new BinaryWriter(wav, System.Text.Encoding.ASCII, leaveOpen: true))
        {
            int data = samples.Count * 2;
            w.Write("RIFF"u8); w.Write(36 + data); w.Write("WAVE"u8);
            w.Write("fmt "u8); w.Write(16); w.Write((short)1); w.Write((short)1); w.Write(rate); w.Write(rate * 2); w.Write((short)2); w.Write((short)16);
            w.Write("data"u8); w.Write(data);
            foreach (var s in samples) w.Write(s);
        }
        wav.Position = 0;
        try { new SoundPlayer(wav).Play(); } catch { }
    }
}
