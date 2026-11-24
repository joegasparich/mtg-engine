import { startGame } from "@engine/root";

startGame().catch(error => {
    console.error("Could not start the game:", error);
    const message = document.createElement("p");
    message.textContent = "The game could not start. See the browser console for details.";
    document.body.appendChild(message);
});
