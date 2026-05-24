// Utility function or hook to manage the Install App button lifecycle
function setupPwaInstall(buttonId, prePromptHandler) {
    const button = document.getElementById(buttonId);
    if (!button) {
        console.error('Install button element not found:', buttonId);
        return;
    }

    // 1. Global Event Listener (beforeinstallprompt)
    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        // Manually store the event so we can reference it later
        window.deferredPrompt = event;
        // Show the install button
        button.style.display = 'block';
    });

    // 2. Button Click Handler
    button.addEventListener('click', async () => {
        if (window.deferredPrompt) {
            // Show the prompt
            await window.deferredPrompt.prompt();
            
            // Wait for the user's choice
            window.deferredPrompt.userChoice.then((choiceResult) => {
                console.log('User responded:', choiceResult);
                // Optionally, handle the user's choice (e.g., logging, analytics)
            });
            
            // Hide the button after interaction
            button.style.display = 'none';
            window.deferredPrompt = null; // Reset the state
        }
    });
}

// Export this setup function to be called in the main Svelte component or setup script.
// Since we don't know the context, we just provide the function definition.
// Usage: setupPwaInstall('install-button', handleBeforeInstallPrompt);
