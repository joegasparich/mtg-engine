import * as PIXI from "pixi.js";

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

interface DrawArrowOptions {
    color?: number;
    lineWidth?: number;
    arrowheadLength?: number;
    arrowheadAngle?: number;
    alpha?: number; // Alpha for the stroke
}

export function drawArrow(
    graphics: PIXI.Graphics,
    worldP1: PIXI.PointData, // Starting point of the arrow in world coordinates
    worldP2: PIXI.PointData, // Ending point (tip) of the arrow in world coordinates
    options: DrawArrowOptions = {}
) {
    const {
        color = 0x63b3ed, // Default color
        lineWidth = 3,
        arrowheadLength = 20,
        arrowheadAngle = Math.PI / 7, // Approx 25.7 degrees
        alpha = 1.0 // Default alpha for the stroke
    } = options;

    // 1. Position the Graphics object at the arrow's starting point (worldP1).
    //    All subsequent drawing will be in the local space of this Graphics object.
    graphics.position.set(worldP1.x, worldP1.y);

    // 2. Clear any previous drawing on this Graphics object.
    graphics.clear();

    // 3. Calculate the end point (worldP2) in local coordinates (relative to worldP1).
    const localP2X = worldP2.x - worldP1.x;
    const localP2Y = worldP2.y - worldP1.y;

    // 4. Calculate properties of the arrow in this local coordinate system.
    const dx = localP2X;
    const dy = localP2Y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Define the stroke style object for the .stroke() method.
    // This matches the style of your working example.
    const strokeStyle = { width: lineWidth, color: color, alpha: alpha };

    // 5. Handle cases where the arrow is too short for a full arrowhead, or has zero length.
    if (distance < arrowheadLength / 2 || distance < 0.001) { // Check for very small or zero distance
        if (distance >= 0.001) { // Only draw if there's some length
            // Draw a simple line from local origin (0,0) to localP2.
            graphics.moveTo(0, 0)
                .lineTo(localP2X, localP2Y)
                .stroke(strokeStyle);
        }
        // If distance is essentially zero, clear() has already made it blank.
        return;
    }

    // 6. Draw the main line segment (the shaft of the arrow).
    // This starts at (0,0) in local coordinates (which is worldP1)
    // and ends at (localP2X, localP2Y) in local coordinates (which is worldP2).
    graphics.moveTo(0, 0)
        .lineTo(localP2X, localP2Y)
        .stroke(strokeStyle);

    // 7. Calculate the angle of the arrow for the arrowhead (in local space).
    const angle = Math.atan2(dy, dx);

    // 8. Calculate the points for the arrowhead barbs relative to localP2.
    // The tip of the arrow is at (localP2X, localP2Y) in local coordinates.
    const barb1X = localP2X - arrowheadLength * Math.cos(angle - arrowheadAngle);
    const barb1Y = localP2Y - arrowheadLength * Math.sin(angle - arrowheadAngle);

    const barb2X = localP2X - arrowheadLength * Math.cos(angle + arrowheadAngle);
    const barb2Y = localP2Y - arrowheadLength * Math.sin(angle + arrowheadAngle);

    // 9. Draw the arrowhead barbs using the .stroke() method for each.
    // Each barb starts at the tip (localP2X, localP2Y).
    graphics.moveTo(localP2X, localP2Y)
        .lineTo(barb1X, barb1Y)
        .stroke(strokeStyle);

    graphics.moveTo(localP2X, localP2Y)
        .lineTo(barb2X, barb2Y)
        .stroke(strokeStyle);
}