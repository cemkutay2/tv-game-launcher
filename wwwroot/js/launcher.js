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

// Initialize TV remote spatial navigation
window.appLauncher.initSpatialNavigation = function() {
    if (window.appLauncher.navInitialized) return;
    window.appLauncher.navInitialized = true;

    document.addEventListener('keydown', function(e) {
        if (window.appLauncher.activeGame) return; // Let Phaser handle inputs

        const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'];
        if (!keys.includes(e.key)) return;

        const cards = Array.from(document.querySelectorAll('.game-card'));
        if (cards.length === 0) return;

        let currentIndex = cards.indexOf(document.activeElement);

        // First press focuses the first item
        if (currentIndex === -1) {
            cards[0].focus();
            e.preventDefault();
            return;
        }

        const currentCard = cards[currentIndex];
        const currentRect = currentCard.getBoundingClientRect();
        
        // Find cards in the same row to determine grid columns
        const rowCards = cards.filter(c => Math.abs(c.getBoundingClientRect().top - currentRect.top) < 10);
        const cols = rowCards.length;

        let nextIndex = currentIndex;

        if (e.key === 'ArrowRight') {
            nextIndex = Math.min(currentIndex + 1, cards.length - 1);
        } else if (e.key === 'ArrowLeft') {
            nextIndex = Math.max(currentIndex - 1, 0);
        } else if (e.key === 'ArrowDown') {
            nextIndex = Math.min(currentIndex + cols, cards.length - 1);
        } else if (e.key === 'ArrowUp') {
            nextIndex = Math.max(currentIndex - cols, 0);
        } else if (e.key === 'Enter') {
            currentCard.click();
            e.preventDefault();
            return;
        }

        if (nextIndex !== currentIndex) {
            e.preventDefault(); // Stop default scroll
            const nextCard = cards[nextIndex];
            nextCard.focus();
            
            // Smoothly scroll the container to keep the focused card perfectly visible
            nextCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            // Prevent default even if we hit the edge of the grid
            e.preventDefault();
        }
    });
};
