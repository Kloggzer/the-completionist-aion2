using System.Diagnostics;
using System.Runtime.InteropServices;

namespace PetOverlay;

static class Native
{
    public const int WM_HOTKEY = 0x0312;
    public const int WM_NCHITTEST = 0x0084;
    public const int WM_NCLBUTTONDOWN = 0x00A1;
    public const int HTCAPTION = 2;
    public const int HTLEFT = 10, HTRIGHT = 11, HTTOP = 12, HTTOPLEFT = 13, HTTOPRIGHT = 14,
                     HTBOTTOM = 15, HTBOTTOMLEFT = 16, HTBOTTOMRIGHT = 17;

    public const int WS_EX_LAYERED = 0x00080000;
    public const int WS_EX_TRANSPARENT = 0x00000020;
    public const int WS_EX_TOOLWINDOW = 0x00000080;
    public const int WS_EX_NOACTIVATE = 0x08000000;

    const uint MOD_ALT = 0x1, MOD_CONTROL = 0x2, MOD_SHIFT = 0x4, MOD_NOREPEAT = 0x4000;

    static readonly IntPtr HWND_TOPMOST = new(-1);
    const uint SWP_NOSIZE = 0x1, SWP_NOMOVE = 0x2, SWP_NOACTIVATE = 0x10;

    [DllImport("user32.dll")] public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint mods, uint vk);
    [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr hWnd, int id);
    [DllImport("user32.dll")] public static extern bool ReleaseCapture();
    [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
    delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);

    /// Largest visible top-level window of a process, found by window enumeration (no process handle is opened).
    public static IntPtr MainWindowOf(string processName)
    {
        var pids = Process.GetProcessesByName(Path.GetFileNameWithoutExtension(processName)).Select(p => (uint)p.Id).ToHashSet();
        IntPtr best = IntPtr.Zero; long bestArea = 0;
        EnumWindows((h, _) =>
        {
            GetWindowThreadProcessId(h, out var pid);
            if (pids.Contains(pid) && IsWindowVisible(h))
            {
                if (GetWindowRect(h, out var rc)) { long a = (long)(rc.Right - rc.Left) * (rc.Bottom - rc.Top); if (a > bestArea) { bestArea = a; best = h; } }
            }
            return true;
        }, IntPtr.Zero);
        return best;
    }
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] static extern int GetSystemMetricsForDpi(int index, uint dpi);
    [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr hWnd);

    /// Width/height of the (invisible) resize border of a sizable window at its DPI.
    public static (int x, int y) ResizeBorder(IntPtr hWnd)
    {
        uint dpi = GetDpiForWindow(hWnd);
        int pad = GetSystemMetricsForDpi(92, dpi); // SM_CXPADDEDBORDER
        return (GetSystemMetricsForDpi(32, dpi) + pad, GetSystemMetricsForDpi(33, dpi) + pad); // SM_CXSIZEFRAME, SM_CYSIZEFRAME
    }
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hWnd, out RECT r);

    // Starts a native move (HTCAPTION) or resize (HT* edge) while the mouse button is still down.
    public static void BeginDrag(IntPtr hWnd, int hit = HTCAPTION)
    {
        // lParam must carry the cursor's screen position: sizing measures from it (0,0 broke resizing).
        var p = Cursor.Position;
        ReleaseCapture();
        SendMessage(hWnd, WM_NCLBUTTONDOWN, hit, (IntPtr)((p.Y & 0xFFFF) << 16 | (p.X & 0xFFFF)));
    }

    // Games in borderless mode like to steal the top spot; re-assert it without stealing focus.
    public static void KeepOnTop(IntPtr hWnd) =>
        SetWindowPos(hWnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);

    // "Ctrl+Alt+M" -> (modifiers, virtual key)
    public static bool TryParseHotkey(string text, out uint mods, out uint vk)
    {
        mods = MOD_NOREPEAT;
        vk = 0;
        foreach (var part in text.Split('+', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
        {
            switch (part.ToLowerInvariant())
            {
                case "alt": mods |= MOD_ALT; break;
                case "ctrl" or "strg": mods |= MOD_CONTROL; break;
                case "shift": mods |= MOD_SHIFT; break;
                default:
                    if (!Enum.TryParse<Keys>(part, true, out var k)) return false;
                    vk = (uint)k;
                    break;
            }
        }
        return vk != 0;
    }
}
