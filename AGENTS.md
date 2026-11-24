- You can find the official rules under ref/MagicCompRules.txt
- Where appropriate, reference the magic rule number

# Implementing Cards
- We are implementing Limited Edition Alpha cards, but use artwork from the 30th anniversary set since the text is accurate https://scryfall.com/sets/30a
- Implement the smallest possible feature set for each card, but do so in a way that prepares for future game rules/systems
- As much as possible, implement the card's mechanics using abilities rather than modifying core system classes. Add hooks as needed.

# Abilities
- Each ability part should be completely decoupled from other ability parts. They should be atomic and reusable
- Try to keep all logic in ability parts rather than in game code unless it's a very core system
- Ability parts can read, store, and modify values to the slate. This allows communication between configured parts.

# Tests
- Add general tests as well as tests for each card under it's set unless that card is just a straightforward creature with Power/Toughness and simple keywords.
