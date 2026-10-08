using System.Globalization;

namespace PetOverlay;

/// UI language of the host-side texts (tray menu, status, announcer). The web UI decides (Windows display
/// language unless the user picked one) and reports it with a "lang" message; until then the Windows setting counts.
static class L
{
    public static bool De { get; set; } = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "de";

    public static string T(string de, string en) => De ? de : en;
}
