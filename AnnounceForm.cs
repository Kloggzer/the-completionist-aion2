namespace PetOverlay;

// Upcoming-event announcer (world bosses, rifts, sieges ...): a small always-on-top stack of cards, each with a
// live countdown and a close button. Clickable but never activated, so the game keeps the focus.
sealed class AnnounceForm : Form
{
    sealed record Entry(string Key, DateTime At, Panel Card, Label Title, Label When);

    static readonly Color Bg = Color.FromArgb(24, 28, 40), Gold = Color.FromArgb(255, 210, 94), Fg = Color.FromArgb(221, 226, 236);
    readonly FlowLayoutPanel stack = new() { FlowDirection = FlowDirection.TopDown, AutoSize = true, WrapContents = false, BackColor = Color.Transparent };
    readonly List<Entry> entries = new();
    readonly System.Windows.Forms.Timer tick = new() { Interval = 1000 };
    // Saved top-left corner (screen px); null = default spot. The whole card is a drag handle.
    public Point? SavedLocation { get; set; }
    public event Action<Point>? Moved;

    public AnnounceForm()
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        BackColor = Color.FromArgb(10, 12, 18);
        TransparencyKey = BackColor;
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        Controls.Add(stack);
        tick.Tick += (_, _) => Refresh_();
    }

    protected override bool ShowWithoutActivation => true;

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            cp.ExStyle |= Native.WS_EX_TOOLWINDOW | Native.WS_EX_NOACTIVATE;
            return cp;
        }
    }

    public void Announce(string key, string title, string detail, DateTime at, Screen screen)
    {
        if (entries.Any(e => e.Key == key)) return;
        float s = DeviceDpi / 96f;
        var card = new Panel { BackColor = Bg, Width = (int)(340 * s), Height = (int)(64 * s), Margin = new Padding(0, 0, 0, (int)(6 * s)) };
        var t = new Label { Text = title, ForeColor = Gold, Font = new Font("Segoe UI Semibold", 12f), AutoSize = false, Location = new Point((int)(12 * s), (int)(7 * s)), Size = new Size((int)(290 * s), (int)(24 * s)) };
        var w = new Label { ForeColor = Fg, Font = new Font("Segoe UI", 10f), AutoSize = false, Location = new Point((int)(12 * s), (int)(33 * s)), Size = new Size((int)(300 * s), (int)(22 * s)), Tag = detail };
        var x = new Button { Text = "✕", FlatStyle = FlatStyle.Flat, ForeColor = Fg, BackColor = Bg, Size = new Size((int)(30 * s), (int)(28 * s)), Location = new Point((int)(304 * s), (int)(5 * s)), TabStop = false, Cursor = Cursors.Hand };
        x.FlatAppearance.BorderSize = 0;
        card.Paint += (_, e) => { using var pen = new Pen(Gold, 2); e.Graphics.DrawRectangle(pen, 1, 1, card.Width - 3, card.Height - 3); };
        card.Controls.AddRange([t, w, x]);
        foreach (Control c in new Control[] { card, t, w })
        {
            c.Cursor = Cursors.SizeAll;
            c.MouseDown += (_, e) => { if (e.Button == MouseButtons.Left) Native.BeginDrag(Handle); };
        }
        var entry = new Entry(key, at, card, t, w);
        x.Click += (_, _) => Remove(entry);
        entries.Add(entry);
        stack.Controls.Add(card);
        Refresh_();
        var wa = screen.WorkingArea;
        var spot = SavedLocation is { } p && Screen.AllScreens.Any(sc => sc.WorkingArea.Contains(p)) ? p
            : new Point(wa.Right - card.Width - (int)(24 * s), wa.Top + wa.Height / 5);
        if (!Visible) Location = spot;
        if (!Visible) Show();
        Native.KeepOnTop(Handle);
        tick.Start();
    }

    protected override void OnResizeEnd(EventArgs e)
    {
        base.OnResizeEnd(e); // also fires after a drag-move
        SavedLocation = Location;
        Moved?.Invoke(Location);
    }

    void Remove(Entry e)
    {
        entries.Remove(e);
        stack.Controls.Remove(e.Card);
        e.Card.Dispose();
        if (entries.Count == 0) { tick.Stop(); Hide(); }
    }

    void Refresh_()
    {
        var now = DateTime.UtcNow;
        foreach (var e in entries.ToArray())
        {
            var left = e.At - now;
            if (left < TimeSpan.FromMinutes(-2)) { Remove(e); continue; } // started a while ago: done
            string when = left.TotalSeconds > 0 ? $"in {(int)left.TotalMinutes}:{left.Seconds:00}" : L.T("läuft jetzt!", "starting now!");
            e.When.Text = $"{when} · {e.When.Tag}";
            e.Title.ForeColor = left.TotalSeconds <= 60 ? Color.FromArgb(255, 120, 120) : Gold;
        }
    }
}
