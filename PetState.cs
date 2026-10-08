using System.Text.Json;

namespace PetOverlay;

sealed record SoulEvent(uint Pet, int Gained, int Level, int Souls, int Need, bool LevelUp);

// Progress entered by hand: pet levels and souls (thresholds 5 / 25 / 75, the counter resets on level-up),
// achievement counters and the active character.
sealed class PetState
{
    public Dictionary<uint, int> Levels { get; set; } = new();
    public Dictionary<uint, int> Souls { get; set; } = new();
    public DateTime? UpdatedAt { get; set; }
    // Achievement id -> [counter, tier, last change unix ms].
    public Dictionary<uint, long[]> Ach { get; set; } = new();
    public string CharName { get; set; } = "";

    public static int Need(int level) => level switch { 0 => 5, 1 => 25, 2 => 75, _ => 0 };

    /// +n souls for a pet; levels up at the thresholds.
    public SoulEvent Gain(uint pet, int gained, DateTime ts)
    {
        int lv = Levels.GetValueOrDefault(pet), souls = Souls.GetValueOrDefault(pet) + gained;
        bool up = false;
        while (lv < 3 && souls >= Need(lv))
        {
            souls -= Need(lv);
            lv++;
            up = true;
        }
        if (lv >= 3) souls = 0;
        if (lv > 0) Levels[pet] = lv;
        Souls[pet] = souls;
        UpdatedAt = ts;
        return new SoulEvent(pet, gained, lv, souls, Need(lv), up);
    }

    /// Level and souls set directly (thresholds as in Gain; Lv3 has no counter).
    public void Set(uint pet, int level, int souls, DateTime ts)
    {
        level = Math.Clamp(level, 0, 3);
        souls = level >= 3 ? 0 : Math.Clamp(souls, 0, Need(level) - 1);
        if (level > 0) Levels[pet] = level; else Levels.Remove(pet);
        Souls[pet] = souls;
        UpdatedAt = ts;
    }

    public static PetState? Load(string path)
    {
        try { return File.Exists(path) ? JsonSerializer.Deserialize<PetState>(File.ReadAllText(path)) : null; }
        catch { return null; }
    }

    public void Save(string path)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
            File.WriteAllText(path, JsonSerializer.Serialize(this));
        }
        catch { }
    }
}
