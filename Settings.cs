using System.Text.Json;
using System.Text.Json.Nodes;

namespace PetOverlay;

sealed class Settings
{
    public int X { get; set; } = -1;
    public int Y { get; set; } = -1;
    public int Width { get; set; } = -1;
    public int Height { get; set; } = -1;
    public bool Visible { get; set; } = true;
    public double Opacity { get; set; } = 0.92;
    public double Zoom { get; set; } = 1.0;
    public bool OnlineUpdates { get; set; } = true;
    // "auto": overlay on the game's monitor, normal window (snap/dock, taskbar, not on top) elsewhere or without the game;
    // "overlay" / "window": fixed.
    public string Dock { get; set; } = "auto";
    public int AnnounceX { get; set; } = int.MinValue;
    public int AnnounceY { get; set; } = int.MinValue;
    public string StatePath { get; set; } = "";
    public Dictionary<string, string> Hotkeys { get; set; } = new();
    // UI-only preferences (map, sort, filters, ticked cubes, ...), owned by the web UI (web/src).
    public JsonObject Ui { get; set; } = new();

    /// Game executable whose window decides the automatic dock mode (only its window position is looked at).
    public const string GameProcess = "AION2.exe";

    public static readonly Dictionary<string, string> DefaultHotkeys = new()
    {
        // Ctrl+Alt: plain Alt+letter combos are partly game shortcuts (Alt+C wings, Alt+V, Alt+H, ...).
        ["toggle"] = "Ctrl+Alt+M", ["click"] = "Ctrl+Alt+C", ["site"] = "Ctrl+Alt+W",
        ["opaUp"] = "Ctrl+Alt+PageUp", ["opaDown"] = "Ctrl+Alt+PageDown", ["zoomIn"] = "Ctrl+Alt+Oemplus", ["zoomOut"] = "Ctrl+Alt+OemMinus",
    };

    public static string DataDir { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "TheCompletionist");

    public string EffectiveStatePath => string.IsNullOrWhiteSpace(StatePath) ? Path.Combine(DataDir, "pet_state.json") : StatePath;

    static string FilePath => Path.Combine(DataDir, "settings.json");

    public static Settings Load()
    {
        Settings s;
        try { s = File.Exists(FilePath) ? JsonSerializer.Deserialize<Settings>(File.ReadAllText(FilePath)) ?? new() : new(); }
        catch { s = new(); }
        // Hotkeys of removed actions (settings from older versions) are dropped.
        foreach (var k in s.Hotkeys.Keys.Where(k => !DefaultHotkeys.ContainsKey(k)).ToList()) s.Hotkeys.Remove(k);
        foreach (var (k, v) in DefaultHotkeys) s.Hotkeys.TryAdd(k, v);
        return s;
    }

    public void Save()
    {
        try
        {
            Directory.CreateDirectory(DataDir);
            File.WriteAllText(FilePath, JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch { }
    }
}
