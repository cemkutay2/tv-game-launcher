namespace tv_game_launcher;

public partial class MainPage : ContentPage
{
	public static Func<bool> BackButtonPressed;

	public MainPage()
	{
		InitializeComponent();
	}

	protected override bool OnBackButtonPressed()
	{
		if (BackButtonPressed != null && BackButtonPressed.Invoke())
		{
			return true;
		}
		return base.OnBackButtonPressed();
	}
}
