using Android.App;
using Android.Content.PM;
using Android.OS;

namespace tv_game_launcher;

[Activity(Theme = "@style/Maui.SplashTheme", MainLauncher = true, Exported = true, ConfigurationChanges = ConfigChanges.ScreenSize | ConfigChanges.Orientation | ConfigChanges.UiMode | ConfigChanges.ScreenLayout | ConfigChanges.SmallestScreenSize | ConfigChanges.Density)]
[IntentFilter(new[] { Android.Content.Intent.ActionMain },
    Categories = new[] {
        Android.Content.Intent.CategoryLauncher,
        Android.Content.Intent.CategoryLeanbackLauncher,
        Android.Content.Intent.CategoryHome,
        Android.Content.Intent.CategoryDefault
    })]
public class MainActivity : MauiAppCompatActivity
{
}
