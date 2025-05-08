export function calculateCardPositionsRelativeToCenter(
    numberOfCards: number,
    cardWidth: number,
    containerWidth: number,
    spacing: number = 0
): number[] {
    // 1. Handle edge cases: no cards or invalid card width.
    if (numberOfCards <= 0) {
        return []; // No cards, so no positions to return.
    }
    if (cardWidth <= 0) {
        console.warn("cardWidth must be a positive number. Returning empty array.");
        return []; // Invalid card width.
    }

    // 2. Calculate the total width occupied by the cards themselves.
    const totalCardsWidth = numberOfCards * cardWidth;

    // 3. Determine the effective spacing to use.
    let effectiveSpacing = spacing;
    if (numberOfCards > 1) {
        // Calculate the content width with the initial desired spacing.
        const initialContentWidthWithDesiredSpacing = totalCardsWidth + (numberOfCards - 1) * spacing;

        if (initialContentWidthWithDesiredSpacing > containerWidth) {
            // Cards with original spacing exceed container width, calculate new spacing to make them fit.
            // This new spacing might be negative (overlap).
            effectiveSpacing = (containerWidth - totalCardsWidth) / (numberOfCards - 1);
        }
    }

    // 4. Calculate the final total width of the content using the effective spacing.
    // If numberOfCards === 1, totalSpacingComponent will be 0.
    const totalSpacingComponent = numberOfCards > 1 ? (numberOfCards - 1) * effectiveSpacing : 0;
    const finalTotalContentWidth = totalCardsWidth + totalSpacingComponent;

    // 5. Determine the starting x-position of the first card's left edge
    //    such that the entire group of cards is centered within the container.
    //    If bunching occurred to fit, finalTotalContentWidth should be <= containerWidth.
    const listStartOffset = (containerWidth - finalTotalContentWidth) / 2;

    // 6. Calculate the container's center x-coordinate (our reference point 0).
    const containerCenter = containerWidth / 2;

    const positions: number[] = [];
    let currentCardLeftAbsolute = listStartOffset; // Left edge of current card from container's left

    // 7. Iterate through each card to calculate its position.
    for (let i = 0; i < numberOfCards; i++) {
        // Calculate the absolute x-position of the current card's center (from container's left edge).
        const currentCardCenterAbsolute = currentCardLeftAbsolute + cardWidth / 2;

        // Calculate the position relative to the container's center.
        const cardPositionRelativeToContainerCenter = currentCardCenterAbsolute - containerCenter;
        positions.push(cardPositionRelativeToContainerCenter);

        // Advance to the left edge of the next card using the effective spacing.
        currentCardLeftAbsolute += cardWidth + effectiveSpacing;
    }

    return positions;
}