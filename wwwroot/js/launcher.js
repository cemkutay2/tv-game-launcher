window.appLauncher = {
    activeGame: null,
    
    loadGame: function(scriptUrl) {
        console.log("Loading game from: " + scriptUrl);
        return new Promise((resolve, reject) => {
            // Remove existing script if any
            let existingScript = document.getElementById('active-game-script');
            if (existingScript) {
                existingScript.remove();
            }

            const script = document.createElement('script');
            script.id = 'active-game-script';
            script.src = scriptUrl + "?t=" + new Date().getTime(); // Prevent caching during dev
            script.onload = () => {
                console.log("Game script loaded.");
                if (typeof window.launchGame === 'function') {
                    // launchGame should initialize Phaser and return the instance
                    window.appLauncher.activeGame = window.launchGame('game-container');
                    resolve();
                } else {
                    reject("Game script did not define window.launchGame");
                }
            };
            script.onerror = () => reject("Failed to load script: " + scriptUrl);
            document.body.appendChild(script);
        });
    },

    exitGame: function() {
        console.log("Exiting game...");
        if (window.appLauncher.activeGame) {
            // Destroy the Phaser game instance completely
            window.appLauncher.activeGame.destroy(true);
            window.appLauncher.activeGame = null;
        }
        
        // Clean up the container
        const container = document.getElementById('game-container');
        if (container) {
            container.innerHTML = '';
        }
        
        // Unset the launchGame function to avoid conflicts
        window.launchGame = null;
    }
};
