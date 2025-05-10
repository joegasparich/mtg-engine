/* Randomize array in-place using Durstenfeld shuffle algorithm */
export function shuffleArray<T>(array: T[]) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}

export function removeItem<T>(array: T[], item: T) {
    const index = array.indexOf(item);
    if (index > -1) {
        array.splice(index, 1);
    }
}
