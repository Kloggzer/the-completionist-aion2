namespace PetOverlay;

// Small always-on-top banner for important events (e.g. from an optional local module), shown even while the overlay
// is hidden. Never takes focus; disappears on its own.
sealed class AlertForm : Form
{
    readonly Label title = new() { AutoSize = true, ForeColor = Color.FromArgb(255, 210, 94), Font = new Font("Segoe UI Semibold", 15f) };
    readonly Label sub = new() { AutoSize = true, ForeColor = Color.FromArgb(221, 226, 236), Font = new Font("Segoe UI", 11f) };
    readonly System.Windows.Forms.Timer hideTimer = new();

    public AlertForm()
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        BackColor = Color.FromArgb(40, 32, 12);
        Opacity = 0.94;
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        Padding = new Padding(18, 10, 22, 12);
        var stack = new FlowLayoutPanel { FlowDirection = FlowDirection.TopDown, AutoSize = true, WrapContents = false, BackColor = Color.Transparent };
        stack.Controls.Add(title);
        stack.Controls.Add(sub);
        Controls.Add(stack);
        hideTimer.Tick += (_, _) => { hideTimer.Stop(); Hide(); };
    }

    protected override bool ShowWithoutActivation => true;

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            // Click-through and no activation: it must never get in the way of the game.
            cp.ExStyle |= Native.WS_EX_TOOLWINDOW | Native.WS_EX_NOACTIVATE | Native.WS_EX_LAYERED | Native.WS_EX_TRANSPARENT;
            return cp;
        }
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        using var pen = new Pen(Color.FromArgb(255, 210, 94), 2);
        e.Graphics.DrawRectangle(pen, 1, 1, Width - 3, Height - 3);
    }

    public void ShowAlert(string text, string detail, Screen screen, int seconds = 8)
    {
        title.Text = text;
        sub.Text = detail;
        sub.Visible = detail.Length > 0;
        if (!Visible) Show();
        PerformLayout();
        var wa = screen.WorkingArea;
        Location = new Point(wa.Left + (wa.Width - Width) / 2, wa.Top + wa.Height / 9);
        Native.KeepOnTop(Handle);
        Invalidate();
        hideTimer.Stop();
        hideTimer.Interval = seconds * 1000;
        hideTimer.Start();
    }
}
