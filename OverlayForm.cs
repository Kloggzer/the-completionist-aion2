using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace PetOverlay;

sealed class OverlayForm : Form
{
    const string AppHost = "https://app.petoverlay/";
    // Resizing only via the native frame around the page: a resize started inside the WebView loses the mouse to the
    // browser as soon as the cursor moves back over the page (growing worked, shrinking did not). Bottom is a grip bar.
    const int Grip = 6, GripBottom = 11;
    static readonly Color Bg = Color.FromArgb(17, 20, 28);
    static readonly Color BgClickThrough = Color.FromArgb(110, 40, 48);
    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    readonly Settings settings;
    readonly WebView2 ui = new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Bg };
    WebView2? site;
    AlertForm? alert;
    AnnounceForm? announce;
    readonly NotifyIcon tray = new();
    readonly System.Windows.Forms.Timer topTimer = new() { Interval = 2000 };
    readonly System.Windows.Forms.Timer saveTimer = new() { Interval = 1500 };
    // While click-through is on, the header stays clickable: Cursor.Position polling (no input hook).
    readonly System.Windows.Forms.Timer ctTimer = new() { Interval = 80 };
    bool ctHeader;
    readonly string? startView;
    string statePath;
    readonly string[] hotkeyIds = Settings.DefaultHotkeys.Keys.ToArray();
    readonly Dictionary<string, bool> hotkeyOk = new();

    PetState state;
    bool clickThrough, siteMode, uiReady, typing;
    static readonly string Version = typeof(OverlayForm).Assembly.GetName().Version is { } v ? $"{v.Major}.{v.Minor}.{v.Build}" : "";
    bool? dataOk;

    float DpiScale => DeviceDpi / 96f;

    public OverlayForm(string? startView = null)
    {
        this.startView = startView;
        settings = Settings.Load();
        if ((string?)settings.Ui["lang"] is "de" or "en") L.De = (string?)settings.Ui["lang"] == "de";
        statePath = settings.EffectiveStatePath;
        state = PetState.Load(statePath) ?? new PetState();

        Text = "The Completionist";
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? PawIcon();
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        BackColor = Bg;
        Padding = new Padding(Grip, Grip, Grip, GripBottom);
        Opacity = Math.Clamp(settings.Opacity, 0.3, 1.0);
        AutoScaleMode = AutoScaleMode.None;

        if (settings.Width < 0) { settings.Width = (int)(440 * DpiScale); settings.Height = (int)(720 * DpiScale); }
        MinimumSize = new Size((int)(220 * DpiScale), (int)(40 * DpiScale));
        var wa = Screen.PrimaryScreen!.WorkingArea;
        Size = new Size(settings.Width, settings.Height);
        // -1/-1 = never placed. Other negative values are valid: monitors left of / above the primary one.
        var pos = settings.X != -1 || settings.Y != -1 ? new Point(settings.X, settings.Y) : new Point(wa.Right - Width - (int)(24 * DpiScale), wa.Top + (int)(80 * DpiScale));
        Location = Screen.AllScreens.Any(s => s.WorkingArea.IntersectsWith(new Rectangle(pos, new Size(60, 30)))) ? pos : new Point(wa.Left + 40, wa.Top + 40);

        windowMode = DecideWindowMode();
        TopMost = !windowMode;
        if (windowMode) Opacity = 1.0;
        Controls.Add(ui);
        BuildTray();
        topTimer.Tick += (_, _) =>
        {
            ApplyWindowMode();
            if (Visible && !windowMode) Native.KeepOnTop(Handle);
        };
        saveTimer.Tick += (_, _) => { saveTimer.Stop(); SaveSettings(); };
        ctTimer.Tick += (_, _) =>
        {
            var p = PointToClient(Cursor.Position);
            bool over = p.X >= 0 && p.X < ClientSize.Width && p.Y >= 0 && p.Y < Grip + (int)(32 * ui.ZoomFactor * DpiScale);
            if (over != ctHeader) { ctHeader = over; UpdateStyles(); }
        };
    }

    // Never take focus from the game, except in the aion2maps view, which needs the keyboard.
    // CreateParams is read by the base constructor already, before the settings are loaded.
    bool windowMode;
    bool WindowMode => windowMode;
    protected override bool ShowWithoutActivation => !WindowMode;

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            // Layered (see-through) only as overlay: for layered windows Windows draws no border or shadow in the
            // resize zone around a normal window, which then shows the desktop.
            if (!WindowMode) cp.ExStyle |= Native.WS_EX_LAYERED;
            if (WindowMode)
            {
                // Frame styles make Windows treat it as a normal window (snap to edges/halves, Win+arrows, maximize);
                // WM_NCCALCSIZE removes the title bar again. APPWINDOW: own taskbar button.
                cp.Style |= WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX;
                cp.ExStyle |= WS_EX_APPWINDOW;
            }
            else
            {
                cp.ExStyle |= Native.WS_EX_TOOLWINDOW;
                // Text fields (character names) need the keyboard, like the aion2maps view.
                if (!siteMode && !typing) cp.ExStyle |= Native.WS_EX_NOACTIVATE;
            }
            if (clickThrough && !ctHeader) cp.ExStyle |= Native.WS_EX_TRANSPARENT;
            return cp;
        }
    }

    protected override async void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        KeepOnScreen();
        RegisterHotkeys();
        topTimer.Start();
        if (!settings.Visible) BeginInvoke(Hide);

        try
        {
            var env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(Settings.DataDir, "WebView2"));
            await ui.EnsureCoreWebView2Async(env);
        }
        catch (Exception ex)
        {
            MessageBox.Show("WebView2 konnte nicht gestartet werden:\n" + ex.Message, Text);
            Close();
            return;
        }

        var core = ui.CoreWebView2;
        core.Settings.AreDefaultContextMenusEnabled = false;
        core.Settings.IsZoomControlEnabled = false;
        core.Settings.AreDevToolsEnabled = Debugger.IsAttached || Environment.GetEnvironmentVariable("PETOVERLAY_DEVTOOLS") == "1";
        core.AddWebResourceRequestedFilter(AppHost + "*", CoreWebView2WebResourceContext.All);
        core.WebResourceRequested += (_, a) => a.Response = ServeApp(core.Environment, a.Request.Uri);
        core.NewWindowRequested += (_, a) => { a.Handled = true; OpenExternal(a.Uri); };
        core.WebMessageReceived += (_, a) => OnUiMessage(a.WebMessageAsJson);
        ui.ZoomFactor = settings.Zoom;
        core.Navigate(AppHost + "index.html");

        _ = Task.Run(async () =>
        {
            GameData.Online = settings.OnlineUpdates;
            bool ok = await GameData.EnsureBase();
            BeginInvoke(() => { dataOk = ok; Post(new { type = "dataReady", ok }); });
        });
    }

    // ---------------------------------------------------------------- UI bridge

    CoreWebView2WebResourceResponse ServeApp(CoreWebView2Environment env, string uri)
    {
        var path = Uri.UnescapeDataString(new Uri(uri).AbsolutePath.TrimStart('/'));
        Stream? stream = null;
        if (path.StartsWith("data/"))
        {
            var full = Path.GetFullPath(Path.Combine(GameData.CacheDir, path[5..]));
            if (full.StartsWith(GameData.CacheDir, StringComparison.OrdinalIgnoreCase) && File.Exists(full))
                stream = new MemoryStream(File.ReadAllBytes(full));
        }
        else stream = typeof(OverlayForm).Assembly.GetManifestResourceStream("ui/" + path);

        if (stream == null) return env.CreateWebResourceResponse(null, 404, "Not Found", "");
        var mime = Path.GetExtension(path) switch
        {
            ".html" => "text/html; charset=utf-8", ".js" => "text/javascript; charset=utf-8", ".css" => "text/css; charset=utf-8",
            ".json" => "application/json; charset=utf-8", ".png" => "image/png", ".webp" => "image/webp", ".svg" => "image/svg+xml", ".woff2" => "font/woff2", ".woff" => "font/woff", ".ttf" => "font/ttf", _ => "application/octet-stream",
        };
        return env.CreateWebResourceResponse(stream, 200, "OK", $"Content-Type: {mime}\nCache-Control: no-store");
    }

    void Post(object msg)
    {
        if (uiReady) ui.CoreWebView2?.PostWebMessageAsJson(JsonSerializer.Serialize(msg, Json));
    }

    object SettingsView() => new
    {
        settings.Opacity, settings.Zoom, settings.OnlineUpdates, settings.Dock,
        StatePath = statePath, settings.Hotkeys, HotkeyOk = hotkeyOk, settings.Ui, Version,
    };

    void PostState() => Post(new { type = "state", state });

    async void OnUiMessage(string json)
    {
        JsonNode? m;
        try { m = JsonNode.Parse(json); } catch { return; }
        if (m == null) return;
        switch ((string?)m["type"])
        {
            case "ready":
                uiReady = true;
                Post(new { type = "init", settings = SettingsView(), state, view = startView });
                if (dataOk is { } d) Post(new { type = "dataReady", ok = d });
                PostDock();
                break;
            case "drag": Native.BeginDrag(Handle); break;
            case "resize":
                // Edge zones in the page (the native 3 px border is hard to hit on high-DPI screens).
                Native.BeginDrag(Handle, (string?)m["edge"] switch
                {
                    "l" => Native.HTLEFT, "r" => Native.HTRIGHT, "t" => Native.HTTOP, "b" => Native.HTBOTTOM,
                    "bl" => Native.HTBOTTOMLEFT, "tl" => Native.HTTOPLEFT, "tr" => Native.HTTOPRIGHT, _ => Native.HTBOTTOMRIGHT,
                });
                break;
            case "hide": ToggleVisible(); break;
            case "clickThrough": ToggleClickThrough(); break;
            case "opacity":
                settings.Opacity = Math.Clamp((double?)m["v"] ?? 0.9, 0.3, 1.0);
                if (!windowMode) Opacity = settings.Opacity;
                Post(new { type = "opacity", v = settings.Opacity });
                SaveSoon();
                break;
            case "zoom":
                ui.ZoomFactor = settings.Zoom = Math.Clamp((double?)m["v"] ?? 1, 0.6, 2.0);
                SaveSoon();
                break;
            case "ui":
                if (m["patch"] is JsonObject patch)
                    foreach (var (k, v) in patch) settings.Ui[k] = v?.DeepClone();
                SaveSoon();
                break;
            case "hotkey":
                if ((string?)m["action"] is { } act && settings.Hotkeys.ContainsKey(act))
                {
                    settings.Hotkeys[act] = (string?)m["combo"] ?? "";
                    RegisterHotkeys();
                    SaveSoon();
                    Post(new { type = "settings", settings = SettingsView() });
                }
                break;
            case "online":
                GameData.Online = settings.OnlineUpdates = (bool?)m["on"] ?? true;
                SaveSoon();
                break;
            // ---- progress entered by hand
            case "setPet":
                if ((uint?)m["id"] is uint setId and > 0)
                {
                    state.Set(setId, (int?)m["level"] ?? 0, (int?)m["souls"] ?? 0, DateTime.UtcNow);
                    StateChanged();
                }
                break;
            case "addSoul":
                if ((uint?)m["id"] is uint addId and > 0)
                {
                    var ev = state.Gain(addId, Math.Clamp((int?)m["n"] ?? 1, 1, 75), DateTime.UtcNow);
                    Post(new { type = "soul", ev });
                    StateChanged();
                }
                break;
            case "setAch":
                if ((uint?)m["id"] is uint achId and > 0)
                {
                    long val = Math.Max(0, (long?)m["val"] ?? 0), tier = Math.Max(0, (long?)m["tier"] ?? 0), ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                    state.Ach[achId] = [val, tier, ts];
                    state.Save(statePath);
                    Post(new { type = "achUpd", items = new[] { new long[] { achId, val, tier, ts } } });
                }
                break;
            case "setChar":
                var charName = ((string?)m["name"] ?? "").Trim();
                if (charName.Length > 40) charName = charName[..40];
                state.CharName = charName;
                state.Save(statePath);
                Post(new { type = "char", name = charName });
                break;
            case "typing":
                typing = (bool?)m["on"] ?? false;
                UpdateStyles();
                if (typing && !windowMode) Activate();
                break;
            case "needMap":
                var key = (string?)m["key"] ?? "";
                bool ok = await GameData.EnsureMap(key, (bool?)m["force"] ?? false);
                Post(new { type = "mapReady", key, ok });
                break;
            case "needArt":
                var artKey = (string?)m["key"] ?? "";
                var art = await GameData.EnsureTerrain(artKey, (bool?)m["force"] ?? false);
                Post(new { type = "artReady", key = artKey, file = art });
                break;
            case "refresh":
                bool okBase = await GameData.EnsureBase(true);
                Post(new { type = "dataReady", ok = okBase, refreshed = true });
                break;
            case "plaync":
                var pncId = m["id"]?.DeepClone();
                var (pncStatus, pncBody) = await GameData.PlayNc((string?)m["url"] ?? "");
                Post(new { type = "plaync", id = pncId, status = pncStatus, body = pncBody });
                break;
            case "pickState": PickStatePath(); break;
            case "site": SetSiteMode((bool?)m["on"] ?? !siteMode, (string?)m["map"], (string?)m["search"]); break;
            case "openUrl": OpenExternal((string?)m["url"] ?? ""); break;
            case "quit": Close(); break;
            case "lang":
                var de = (string?)m["lang"] == "de";
                if (de != L.De) { L.De = de; BuildTrayMenu(); }
                break;
            case "log": Log((string?)m["msg"] ?? ""); break;
            case "dock":
                settings.Dock = (string?)m["dock"] is "overlay" or "window" ? (string)m["dock"]! : "auto";
                SaveSettings();
                ApplyWindowMode();
                PostDock();
                break;
            case "chime":
                if ((string?)m["kind"] == "plong") Chime.Plong();
                else Chime.Pling();
                break;
            case "announce":
                if ((bool?)m["sound"] == true) Chime.Timer();
                if (announce == null)
                {
                    announce = new AnnounceForm();
                    if (settings.AnnounceX != int.MinValue) announce.SavedLocation = new Point(settings.AnnounceX, settings.AnnounceY);
                    announce.Moved += p => { settings.AnnounceX = p.X; settings.AnnounceY = p.Y; SaveSoon(); };
                }
                announce.Announce((string?)m["key"] ?? "", (string?)m["title"] ?? "", (string?)m["sub"] ?? "",
                    DateTimeOffset.FromUnixTimeMilliseconds((long?)m["at"] ?? 0).UtcDateTime, Screen.FromControl(this));
                break;
            case "alert":
                // The in-page toast is enough while the full overlay is visible; otherwise use the banner.
                if (!Visible || (bool?)m["always"] == true)
                    (alert ??= new AlertForm()).ShowAlert((string?)m["title"] ?? "", (string?)m["sub"] ?? "", Screen.FromControl(this));
                break;
        }
    }

    void SaveSoon()
    {
        saveTimer.Stop();
        saveTimer.Start();
    }

    void SaveSettings()
    {
        if (WindowState == FormWindowState.Normal)
        {
            settings.X = Left; settings.Y = Top;
            settings.Width = Width; settings.Height = Height;
        }
        settings.Save();
    }

    static void OpenExternal(string url)
    {
        if (Uri.TryCreate(url, UriKind.Absolute, out var u) && u.Scheme == "https" && u.Host.EndsWith("aion2maps.com"))
            Process.Start(new ProcessStartInfo(u.ToString()) { UseShellExecute = true });
    }

    // Overlay: back on top of the game. Window mode: a normal window, no forced top-most.
    void BringUp() { if (!windowMode) Native.KeepOnTop(Handle); }

    // ---------------------------------------------------------------- overlay vs. normal window

    bool DecideWindowMode() => settings.Dock switch
    {
        "window" => true,
        "overlay" => false,
        _ => Native.MainWindowOf(Settings.GameProcess) is var g && (g == IntPtr.Zero || Screen.FromHandle(g).DeviceName != Screen.FromRectangle(Bounds).DeviceName),
    };

    /// Switch between overlay and normal window in place (styles + top-most), e.g. after moving to another monitor.
    void ApplyWindowMode()
    {
        if (!IsHandleCreated || Capture || MouseButtons != MouseButtons.None) return; // not in the middle of a drag
        bool w = DecideWindowMode();
        if (w == windowMode) return;
        if (!w && WindowState != FormWindowState.Normal) WindowState = FormWindowState.Normal;
        windowMode = w;
        bool vis = Visible;
        if (vis) Hide(); // the taskbar picks up the APPWINDOW change only on show
        Opacity = w ? 1.0 : settings.Opacity; // also toggles the layered style
        UpdateStyles();
        TopMost = !w;
        if (vis) { Show(); BringUp(); }
        Log(w ? "Fenster-Modus" : "Overlay-Modus");
        PostDock();
    }
    void PostDock() => Post(new { type = "dock", dock = settings.Dock, window = windowMode });

    void StateChanged()
    {
        state.Save(statePath);
        PostState();
        SyncSite();
    }

    void PickStatePath()
    {
        using var dlg = new SaveFileDialog
        {
            Title = L.T("Speicherort für den Pet-Status", "Location of the pet status file"), Filter = "JSON (*.json)|*.json", FileName = Path.GetFileName(settings.EffectiveStatePath),
            InitialDirectory = Path.GetDirectoryName(settings.EffectiveStatePath), OverwritePrompt = false,
        };
        if (dlg.ShowDialog(this) != DialogResult.OK) return;
        settings.StatePath = statePath = dlg.FileName;
        SaveSettings();
        if (PetState.Load(statePath) is { } loaded) state = loaded;
        else state.Save(statePath);
        PostState();
        Post(new { type = "settings", settings = SettingsView() });
    }

    static void Log(string line)
    {
        try { File.AppendAllText(Path.Combine(Settings.DataDir, "log.txt"), $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} {line}\n"); }
        catch { }
    }

    // ---------------------------------------------------------------- aion2maps view

    // Keeps the site's own "pets complete" list (localStorage vox.petdone, per store) in step with the
    // tracked Lv3 pets, shows our soul progress next to its pet buttons, and reports its Hidden Cube ticks.
    const string SiteScript = """
        (() => {
          if (window.__a2po) return;
          const store = (new URLSearchParams(location.search).get('store') || '').replace(/[^\w-]/g, '').slice(0, 32);
          const SK = k => store ? `${k}@${store}` : k;
          const need = l => [5, 25, 75][l] || 0;
          let data = null, timer = 0;
          const badges = () => {
            if (!data) return;
            for (const b of document.querySelectorAll('button.pdone[data-pdone]')) {
              const id = b.dataset.pdone, lv = data.levels[id] || 0, s = data.souls[id] || 0;
              let el = b.previousElementSibling;
              if (!el || !el.classList.contains('a2po-lv')) { el = document.createElement('span'); el.className = 'a2po-lv'; b.before(el); }
              const t = lv >= 3 ? 'Lv3 ✓' : `Lv${lv} ${s}/${need(lv)}`;
              if (el.textContent !== t) { el.textContent = t; el.title = 'The Completionist: dein Fortschritt'; el.dataset.lv = lv; }
            }
          };
          window.__a2po = {
            update(d) {
              data = d;
              const key = SK('vox.petdone');
              let cur = [];
              try { const v = JSON.parse(localStorage.getItem(key) || '[]'); if (Array.isArray(v)) cur = v.map(Number); } catch {}
              const merged = [...new Set([...cur, ...d.done])];
              if (merged.length !== cur.length) {
                try { localStorage.setItem(key, JSON.stringify(merged)); } catch {}
                dispatchEvent(new Event('vox-pets'));
              }
              badges();
              return merged.length;
            },
            search(q) {
              const i = document.querySelector('input[type=search], input[placeholder*="monster" i]');
              if (!i) return false;
              i.focus(); i.value = q;
              i.dispatchEvent(new Event('input', { bubbles: true }));
              for (const t of ['keydown', 'keyup']) i.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
              return true;
            },
          };
          const start = () => {
            const st = document.createElement('style');
            st.textContent = '.a2po-lv{font:600 11px/1 system-ui;padding:3px 6px;margin:auto 4px;border-radius:9px;background:#2a2340;color:#e8c872;white-space:nowrap;align-self:center}.a2po-lv[data-lv="0"]{color:#9fb3c8;background:#1d2a38}.a2po-lv[data-lv="3"]{color:#7ee0a0;background:#173226}';
            document.head.appendChild(st);
            new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(badges, 120); })
              .observe(document.body, { childList: true, subtree: true });
            // Read-only: Hidden Cubes ticked on the site (vt-done keys "hc:<spawner>", map prefix except Verteron).
            const cubes = {};
            try {
              for (const k of JSON.parse(localStorage.getItem(SK('vt-done')) || '[]')) {
                const m = /^([A-Za-z]\w*_\w+):(.*)$/.exec(k), map = m ? m[1] : 'World_L_A', rest = m ? m[2] : k;
                if (rest.startsWith('hc:')) (cubes[map] ||= []).push(rest.slice(3));
              }
            } catch {}
            window.chrome.webview.postMessage({ type: 'a2po-ready', cubes });
          };
          document.readyState === 'loading' ? addEventListener('DOMContentLoaded', start) : start();
        })();
        """;

    async void SetSiteMode(bool on, string? map, string? search)
    {
        if (on && site == null)
        {
            site = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = Bg, Visible = false };
            Controls.Add(site);
            site.BringToFront();
            await site.EnsureCoreWebView2Async(ui.CoreWebView2.Environment);
            site.CoreWebView2.Settings.AreDevToolsEnabled = false;
            site.CoreWebView2.NewWindowRequested += (_, a) => { a.Handled = true; OpenExternal(a.Uri); };
            site.CoreWebView2.WebMessageReceived += (_, a) =>
            {
                if (!a.Source.StartsWith("https://aion2maps.com/")) return;
                try
                {
                    var msg = JsonNode.Parse(a.WebMessageAsJson);
                    if ((string?)msg?["type"] != "a2po-ready") return;
                    SyncSite();
                    Post(new { type = "siteCubes", cubes = msg["cubes"] });
                }
                catch { }
            };
            await site.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(SiteScript);
        }
        if (site == null) return;

        siteMode = on;
        UpdateStyles();
        if (on)
        {
            var url = $"https://aion2maps.com/map/?map={Uri.EscapeDataString(map ?? "World_D_A")}";
            if (site.Source == null || !site.Source.ToString().Contains("map=" + map)) site.CoreWebView2.Navigate(url);
            ui.Dock = DockStyle.Top;
            ui.Height = (int)(38 * ui.ZoomFactor * DpiScale);
            site.Visible = true;
            if (!string.IsNullOrEmpty(search)) _ = SiteSearch(search);
        }
        else
        {
            site.Visible = false;
            ui.Dock = DockStyle.Fill;
        }
        Post(new { type = "siteMode", on });
    }

    async Task SiteSearch(string q)
    {
        for (int i = 0; i < 40 && site != null; i++)
        {
            await Task.Delay(500);
            var r = await site.CoreWebView2.ExecuteScriptAsync($"window.__a2po ? __a2po.search({JsonSerializer.Serialize(q)}) : false");
            if (r == "true") return;
        }
    }

    async void SyncSite()
    {
        if (site?.CoreWebView2 == null) return;
        var done = state.Levels.Where(kv => kv.Value >= 3).Select(kv => kv.Key).ToArray();
        var levels = state.Levels.ToDictionary(kv => kv.Key.ToString(), kv => kv.Value);
        var souls = state.Souls.ToDictionary(kv => kv.Key.ToString(), kv => kv.Value);
        var json = JsonSerializer.Serialize(new { done, levels, souls });
        var r = await site.CoreWebView2.ExecuteScriptAsync($"window.__a2po ? __a2po.update({json}) : -1");
        Log($"aion2maps-Sync: {done.Length} Pets auf Lv3, vox.petdone enthält jetzt {r}");
    }

    // ---------------------------------------------------------------- window behaviour

    void BuildTray()
    {
        tray.Icon = Icon;
        tray.Text = "The Completionist";
        tray.Visible = true;
        BuildTrayMenu();
        tray.MouseClick += (_, e) => { if (e.Button == MouseButtons.Left) ToggleVisible(); };
    }

    void BuildTrayMenu()
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add(L.T("Ein-/Ausblenden", "Show / hide"), null, (_, _) => ToggleVisible());
        menu.Items.Add(L.T("Click-through umschalten", "Toggle click-through"), null, (_, _) => ToggleClickThrough());
        menu.Items.Add(L.T("Position zurücksetzen", "Reset position"), null, (_, _) =>
        {
            var wa = Screen.PrimaryScreen!.WorkingArea;
            Location = new Point(wa.Right - Width - (int)(24 * DpiScale), wa.Top + (int)(80 * DpiScale));
            if (!Visible) ToggleVisible();
            if (clickThrough) ToggleClickThrough();
        });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(L.T("Beenden", "Quit"), null, (_, _) => Close());
        // Without this the menu can open behind the taskbar, since the overlay never activates.
        menu.Opened += (_, _) => Native.KeepOnTop(menu.Handle);
        var old = tray.ContextMenuStrip;
        tray.ContextMenuStrip = menu;
        old?.Dispose();
    }

    void RegisterHotkeys()
    {
        for (int i = 0; i < hotkeyIds.Length; i++)
        {
            Native.UnregisterHotKey(Handle, i + 1);
            var combo = settings.Hotkeys.GetValueOrDefault(hotkeyIds[i], "");
            hotkeyOk[hotkeyIds[i]] = string.IsNullOrEmpty(combo) ||
                (Native.TryParseHotkey(combo, out var mods, out var vk) && Native.RegisterHotKey(Handle, i + 1, mods, vk));
        }
    }

    void OnHotkey(string id)
    {
        switch (id)
        {
            case "toggle": ToggleVisible(); break;
            case "click": ToggleClickThrough(); break;
            case "site": SetSiteMode(!siteMode, (string?)settings.Ui["map"], null); break;
            case "opaUp": ChangeOpacity(0.05); break;
            case "opaDown": ChangeOpacity(-0.05); break;
            case "zoomIn": ChangeZoom(0.1); break;
            case "zoomOut": ChangeZoom(-0.1); break;
        }
    }

    void ToggleVisible()
    {
        if (Visible) Hide();
        else { Show(); BringUp(); }
        settings.Visible = Visible;
        SaveSoon();
    }

    void ToggleClickThrough()
    {
        clickThrough = !clickThrough;
        ctHeader = false;
        ctTimer.Enabled = clickThrough;
        BackColor = clickThrough ? BgClickThrough : Bg;
        UpdateStyles();
        Post(new { type = "clickThrough", on = clickThrough });
    }

    void ChangeOpacity(double delta)
    {
        settings.Opacity = Math.Clamp(settings.Opacity + delta, 0.3, 1.0);
        if (!windowMode) Opacity = settings.Opacity;
        Post(new { type = "opacity", v = settings.Opacity });
        SaveSoon();
    }

    void ChangeZoom(double delta)
    {
        ui.ZoomFactor = settings.Zoom = Math.Clamp(Math.Round(settings.Zoom + delta, 2), 0.6, 2.0);
        Post(new { type = "zoom", v = settings.Zoom });
        SaveSoon();
    }

    const int WS_CAPTION = 0x00C00000, WS_THICKFRAME = 0x00040000, WS_SYSMENU = 0x00080000, WS_MINIMIZEBOX = 0x00020000, WS_MAXIMIZEBOX = 0x00010000;
    const int WM_NCCALCSIZE = 0x0083, WS_EX_APPWINDOW = 0x00040000;

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WM_NCCALCSIZE && WindowMode && m.WParam != IntPtr.Zero)
        {
            // No title bar, but keep the (invisible) resize borders outside the content: Windows doesn't draw
            // anything there, so content under them would let the desktop show through. DWM then draws the thin
            // native border and shadow. Maximized windows overhang the screen by that border on all sides.
            var r = Marshal.PtrToStructure<Native.RECT>(m.LParam);
            var (fx, fy) = Native.ResizeBorder(Handle);
            r.Left += fx; r.Right -= fx; r.Bottom -= fy;
            if (WindowState == FormWindowState.Maximized) r.Top += fy;
            Marshal.StructureToPtr(r, m.LParam, false);
            m.Result = IntPtr.Zero;
            return;
        }
        if (m.Msg == Native.WM_HOTKEY)
        {
            int i = (int)m.WParam - 1;
            if (i >= 0 && i < hotkeyIds.Length) OnHotkey(hotkeyIds[i]);
            return;
        }

        base.WndProc(ref m);

        // Resize via the thin border around the WebView.
        if (m.Msg == Native.WM_NCHITTEST && (int)m.Result == 1)
        {
            var p = PointToClient(new Point((short)(m.LParam.ToInt64() & 0xFFFF), (short)((m.LParam.ToInt64() >> 16) & 0xFFFF)));
            // Only uncovered form area reaches here (the frame, or a strip the page has not painted yet while resizing):
            // anything near an edge resizes instead of moving the window.
            int e = Math.Max(Grip, (int)(14 * DpiScale));
            bool l = p.X < e, r = p.X >= ClientSize.Width - e, t = p.Y < Grip, b = p.Y >= ClientSize.Height - Math.Max(GripBottom, e);
            // The bar's right end is the corner grip, a comfortable target for both directions.
            if (b && p.X >= ClientSize.Width - (int)(40 * DpiScale)) r = true;
            m.Result = (IntPtr)((t, b, l, r) switch
            {
                (true, _, true, _) => Native.HTTOPLEFT,
                (true, _, _, true) => Native.HTTOPRIGHT,
                (_, true, true, _) => Native.HTBOTTOMLEFT,
                (_, true, _, true) => Native.HTBOTTOMRIGHT,
                (true, _, _, _) => Native.HTTOP,
                (_, true, _, _) => Native.HTBOTTOM,
                (_, _, true, _) => Native.HTLEFT,
                (_, _, _, true) => Native.HTRIGHT,
                _ => Native.HTCAPTION,
            });
        }
    }

    // Grip bar under the page: a short centred handle, so the resize edge is visible.
    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        var g = e.Graphics;
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        using var b = new SolidBrush(Color.FromArgb(95, 105, 125));
        int y = ClientSize.Height - GripBottom / 2 - 1, w = (int)(36 * DpiScale);
        g.FillRectangle(b, (ClientSize.Width - w) / 2, y - 1, w, 2);
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        Invalidate(new Rectangle(0, ClientSize.Height - GripBottom, ClientSize.Width, GripBottom));
    }

    protected override void OnResizeEnd(EventArgs e)
    {
        base.OnResizeEnd(e);
        if (WindowState == FormWindowState.Normal) KeepOnScreen();
        SaveSoon();
        BeginInvoke(ApplyWindowMode); // moved to / away from the game's monitor
    }

    // The whole window stays inside its monitor's work area: an edge pushed off-screen can no longer be grabbed.
    void KeepOnScreen()
    {
        var wa = Screen.FromControl(this).WorkingArea;
        int w = Math.Min(Width, wa.Width), h = Math.Min(Height, wa.Height);
        int x = Math.Clamp(Left, wa.Left, wa.Right - w), y = Math.Clamp(Top, wa.Top, wa.Bottom - h);
        if (x != Left || y != Top || w != Width || h != Height) Bounds = new Rectangle(x, y, w, h);
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        saveTimer.Stop();
        SaveSettings();
        for (int i = 0; i < hotkeyIds.Length; i++) Native.UnregisterHotKey(Handle, i + 1);
        tray.Visible = false;
        tray.Dispose();
        base.OnFormClosing(e);
    }

    // Gold paw on a dark rounded square, drawn so no .ico file is needed.
    static Icon PawIcon()
    {
        using var bmp = new Bitmap(32, 32);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            using var bg = new SolidBrush(Color.FromArgb(30, 26, 44));
            using var path = new System.Drawing.Drawing2D.GraphicsPath();
            path.AddArc(0, 0, 12, 12, 180, 90); path.AddArc(19, 0, 12, 12, 270, 90);
            path.AddArc(19, 19, 12, 12, 0, 90); path.AddArc(0, 19, 12, 12, 90, 90);
            g.FillPath(bg, path);
            using var gold = new SolidBrush(Color.FromArgb(240, 200, 100));
            g.FillEllipse(gold, 9, 15, 14, 11);
            g.FillEllipse(gold, 5, 9, 6, 7); g.FillEllipse(gold, 11, 4, 6, 8);
            g.FillEllipse(gold, 17, 4, 6, 8); g.FillEllipse(gold, 22, 9, 6, 7);
        }
        return Icon.FromHandle(bmp.GetHicon());
    }
}
