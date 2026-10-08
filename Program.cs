namespace PetOverlay;

static class Program
{
    // TheCompletionist.exe [--view settings|site|spots]
    [STAThread]
    static void Main(string[] args)
    {
        string? view = null;
        for (int i = 0; i < args.Length - 1; i++)
            if (args[i] == "--view") view = args[i + 1];

        using var mutex = new Mutex(true, "TheCompletionist.SingleInstance", out bool first);
        if (!first)
        {
            // A newly started exe replaces the running one (usually an older build), instead of silently quitting.
            using var self = System.Diagnostics.Process.GetCurrentProcess();
            foreach (var p in System.Diagnostics.Process.GetProcessesByName(self.ProcessName))
                using (p) if (p.Id != self.Id) try { p.Kill(); p.WaitForExit(5000); } catch { }
            try { mutex.WaitOne(5000); } catch (AbandonedMutexException) { }
        }

        ApplicationConfiguration.Initialize();
        Application.Run(new OverlayForm(view));
    }
}
