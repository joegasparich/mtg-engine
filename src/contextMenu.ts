// -- WARNING: VIBE CODED -- //

// Store the currently active menu and its outside click handler
let activeContextMenu: HTMLDivElement = null;
let activeOutsideClickHandler: (this:Window, ev: MouseEvent) => any = null;

/**
 * Displays a custom context menu.
 * @param {object} position - An object with x and y properties for menu location (e.g., {x: event.pageX, y: event.pageY}).
 * @param {string[]} options - An array of strings representing the menu options.
 * @param {function(string)} onOptionClickCallback - Callback function executed when an option is clicked.
 * It receives the text of the clicked option.
 * @param {Event} [originalEvent] - The original event, if any (e.g., for preventDefault).
 */
export function showCustomContextMenu(position: {x: number, y: number}, options: string[], onOptionClickCallback: (index: number, optionText: string) => void, originalEvent: Event) {
    // Prevent default browser action if it's a specific event like 'contextmenu'
    if (originalEvent && typeof originalEvent.preventDefault === 'function') {
        originalEvent.preventDefault();
    }

    // Remove any existing custom context menu
    removeCustomContextMenu();

    if (!options || options.length === 0) {
        console.warn("No options provided for the context menu.");
        return;
    }

    // Create the menu container
    const menu = document.createElement('div');
    menu.className = 'custom-context-menu'; // Apply basic styling

    // Create and append menu items
    options.forEach((optionText, index) => {
        const item = document.createElement('div');
        item.className = 'custom-context-menu-item';
        item.textContent = optionText;
        item.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent click from bubbling to window listener immediately
            onOptionClickCallback(index, optionText);
            removeCustomContextMenu(); // Close menu after action
        });
        menu.appendChild(item);
    });

    document.body.appendChild(menu);
    activeContextMenu = menu; // Store reference to the active menu

    // Position the menu
    let x = position.x;
    let y = position.y;

    // Append to body and then get dimensions to ensure they are correct
    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Adjust position if menu goes off-screen
    if (x + menuWidth > viewportWidth) {
        x = viewportWidth - menuWidth - 5; // 5px buffer
    }
    if (y + menuHeight > viewportHeight) {
        y = viewportHeight - menuHeight - 5; // 5px buffer
    }
    if (x < 0) x = 5; // Prevent going off left
    if (y < 0) y = 5; // Prevent going off top


    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    // Add event listener to close menu when clicking outside
    // Use a timeout to prevent the same event that might have triggered opening
    // (though less relevant for keydown) from immediately closing it.
    setTimeout(() => {
        activeOutsideClickHandler = (e) => {
            // Check if the click is outside the menu
            if (activeContextMenu && !activeContextMenu.contains(e.target as Node)) {
                removeCustomContextMenu();
            }
        };
        // Listen for clicks on the window to close the menu
        window.addEventListener('click', activeOutsideClickHandler, { capture: true });
    }, 0);
}

/**
 * Removes the currently active custom context menu from the DOM
 * and cleans up its event listeners.
 */
export function removeCustomContextMenu() {
    if (activeContextMenu) {
        activeContextMenu.remove();
        activeContextMenu = null;
    }
    if (activeOutsideClickHandler) {
        window.removeEventListener('click', activeOutsideClickHandler, { capture: true });
        activeOutsideClickHandler = null;
    }
}