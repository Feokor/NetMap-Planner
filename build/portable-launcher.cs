using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;

/*
 * Однофайловый portable-launcher для Vibe Netmap.
 *
 * Внутри exe лежит zip с собранным приложением (ресурс app.zip). При первом
 * запуске архив распаковывается в %LOCALAPPDATA%\VibeNetmap\app-<версия>.
 * Повторные запуски ничего не распаковывают — только стартуют приложение,
 * поэтому старт занимает меньше секунды вместо распаковки 250 МБ каждый раз.
 *
 * Шаблон компилируется scripts/make-portable.mjs, __VERSION__ и __APP_NAME__
 * подставляются из package.json.
 */

static class Program
{
    internal const string Version = "__VERSION__";
    internal const string AppName = "__APP_NAME__";

    /** Префикс длинных путей Windows: иначе распаковка падает на MAX_PATH (260). */
    static string Long(string path)
    {
        if (string.IsNullOrEmpty(path) || path.Length < 240) return path;
        if (path.StartsWith(@"\\?\")) return path;
        if (path.StartsWith(@"\\")) return @"\\?\UNC\" + path.Substring(2);
        return @"\\?\" + path;
    }

    [STAThread]
    static int Main(string[] args)
    {
        string baseDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "VibeNetmap");
        string target = Path.Combine(baseDir, "app-" + Version);
        string exe = Path.Combine(target, AppName + ".exe");
        string marker = Path.Combine(target, ".ready");

        // Маркер пишется только после успешной распаковки: недокачанный каталог
        // от прерванного запуска не должен считаться установленным приложением.
        if (!File.Exists(Long(marker)) || !File.Exists(Long(exe)))
        {
            try
            {
                Extract(baseDir, target);
            }
            catch (Exception error)
            {
                Log(error);
                MessageBox.Show(
                    "Не удалось распаковать приложение:\r\n\r\n" +
                    error.GetType().Name + ": " + error.Message +
                    "\r\n\r\nПодробности: " + LogPath(),
                    AppName,
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return 1;
            }
        }

        var start = new ProcessStartInfo(exe);
        start.WorkingDirectory = target;
        start.UseShellExecute = false;
        if (args.Length > 0)
        {
            start.Arguments = string.Join(" ", Quote(args));
        }
        Process.Start(start);

        CleanupOldVersions(baseDir, target);
        return 0;
    }

    static string LogPath()
    {
        return Path.Combine(Path.GetTempPath(), "vibe-netmap-launcher.log");
    }

    static void Log(Exception error)
    {
        try
        {
            File.AppendAllText(
                LogPath(),
                DateTime.Now.ToString("s") + "  " + error + Environment.NewLine + Environment.NewLine);
        }
        catch
        {
            /* лог не должен мешать сообщению об ошибке */
        }
    }

    static string[] Quote(string[] values)
    {
        var quoted = new string[values.Length];
        for (int i = 0; i < values.Length; i++)
        {
            quoted[i] = "\"" + values[i].Replace("\"", "\\\"") + "\"";
        }
        return quoted;
    }

    static void Extract(string baseDir, string target)
    {
        Directory.CreateDirectory(Long(baseDir));

        // Уникальный каталог на процесс: параллельные запуски не мешают друг другу.
        string temp = target + ".tmp-" + Process.GetCurrentProcess().Id;
        if (Directory.Exists(Long(temp))) Directory.Delete(Long(temp), true);
        CleanupTempDirs(baseDir);
        Directory.CreateDirectory(Long(temp));

        var splash = new SplashForm();
        splash.Show();
        Application.DoEvents();

        try
        {
            using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("app.zip"))
            {
                if (stream == null)
                {
                    throw new InvalidOperationException("встроенный архив app.zip не найден");
                }

                using (var archive = new ZipArchive(stream, ZipArchiveMode.Read))
                {
                    int total = Math.Max(1, archive.Entries.Count);
                    int done = 0;
                    foreach (ZipArchiveEntry entry in archive.Entries)
                    {
                        string relative = entry.FullName.Replace('/', Path.DirectorySeparatorChar);
                        string destination = Long(Path.Combine(temp, relative));

                        if (entry.Name.Length == 0)
                        {
                            Directory.CreateDirectory(destination);
                        }
                        else
                        {
                            string parent = Path.GetDirectoryName(destination);
                            if (!string.IsNullOrEmpty(parent)) Directory.CreateDirectory(parent);
                            using (Stream input = entry.Open())
                            using (FileStream output = new FileStream(
                                destination,
                                FileMode.Create,
                                FileAccess.Write,
                                FileShare.None))
                            {
                                input.CopyTo(output);
                            }
                        }

                        done++;
                        if (done % 25 == 0 || done == total)
                        {
                            splash.SetProgress(done * 100 / total);
                            Application.DoEvents();
                        }
                    }
                }
            }

            if (Directory.Exists(Long(target))) Directory.Delete(Long(target), true);
            Directory.Move(Long(temp), Long(target));
            File.WriteAllText(Long(Path.Combine(target, ".ready")), Version);
        }
        finally
        {
            splash.Close();
            if (Directory.Exists(Long(temp)))
            {
                try { Directory.Delete(Long(temp), true); } catch { /* не критично */ }
            }
        }
    }

    /** Удаляет каталоги .tmp-<pid> от прерванных запусков. */
    static void CleanupTempDirs(string baseDir)
    {
        try
        {
            foreach (string directory in Directory.GetDirectories(baseDir))
            {
                string name = Path.GetFileName(directory);
                if (name.IndexOf(".tmp-", StringComparison.OrdinalIgnoreCase) < 0) continue;
                try { Directory.Delete(Long(directory), true); } catch { /* занят */ }
            }
        }
        catch
        {
            /* уборка не должна мешать распаковке */
        }
    }

    static void CleanupOldVersions(string baseDir, string current)
    {
        try
        {
            foreach (string directory in Directory.GetDirectories(baseDir, "app-*"))
            {
                if (string.Equals(directory, current, StringComparison.OrdinalIgnoreCase)) continue;
                try { Directory.Delete(Long(directory), true); } catch { /* занят другой версией */ }
            }
        }
        catch
        {
            /* уборка не должна мешать запуску */
        }
    }
}

sealed class SplashForm : Form
{
    private readonly Label label;

    public SplashForm()
    {
        Text = Program.AppName;
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen;
        ShowInTaskbar = false;
        Size = new Size(380, 92);
        BackColor = Color.FromArgb(15, 20, 25);
        label = new Label();
        label.ForeColor = Color.Gainsboro;
        label.Font = new Font("Segoe UI", 10f);
        label.Dock = DockStyle.Fill;
        label.TextAlign = ContentAlignment.MiddleCenter;
        label.Text = "Первый запуск: распаковка…";
        Controls.Add(label);
    }

    public void SetProgress(int percent)
    {
        label.Text = "Первый запуск: распаковка… " + percent + " %";
    }
}
