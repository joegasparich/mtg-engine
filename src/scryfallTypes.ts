export interface SFSet {
    object: string
    id: string
    code: string
    tcgplayer_id: number
    name: string
    uri: string
    scryfall_uri: string
    search_uri: string
    released_at: string
    set_type: string
    card_count: number
    digital: boolean
    nonfoil_only: boolean
    foil_only: boolean
    icon_svg_uri: string
}

export interface SFCard {
    object: string
    id: string
    oracle_id: string
    multiverse_ids: number[]
    mtgo_id: number
    arena_id: number
    tcgplayer_id: number
    name: string
    lang: string
    released_at: string
    uri: string
    scryfall_uri: string
    layout: string
    highres_image: boolean
    image_status: string
    image_uris: SFImageUris
    mana_cost: string
    cmc: number
    type_line: string
    oracle_text: string
    colors: any[]
    color_identity: string[]
    keywords: any[]
    produced_mana: string[]
    legalities: SFLegalities
    games: string[]
    reserved: boolean
    game_changer: boolean
    foil: boolean
    nonfoil: boolean
    finishes: string[]
    oversized: boolean
    promo: boolean
    reprint: boolean
    variation: boolean
    set_id: string
    set: string
    set_name: string
    set_type: string
    set_uri: string
    set_search_uri: string
    scryfall_set_uri: string
    rulings_uri: string
    prints_search_uri: string
    collector_number: string
    digital: boolean
    rarity: string
    card_back_id: string
    artist: string
    artist_ids: string[]
    illustration_id: string
    border_color: string
    frame: string
    full_art: boolean
    textless: boolean
    booster: boolean
    story_spotlight: boolean
    prices: SFPrices
    related_uris: SFRelatedUris
    purchase_uris: SFPurchaseUris
}

export interface SFImageUris {
    small: string
    normal: string
    large: string
    png: string
    art_crop: string
    border_crop: string
}

export interface SFLegalities {
    standard: string
    future: string
    historic: string
    timeless: string
    gladiator: string
    pioneer: string
    explorer: string
    modern: string
    legacy: string
    pauper: string
    vintage: string
    penny: string
    commander: string
    oathbreaker: string
    standardbrawl: string
    brawl: string
    alchemy: string
    paupercommander: string
    duel: string
    oldschool: string
    premodern: string
    predh: string
}

export interface SFPrices {
    usd: string
    usd_foil: string
    usd_etched: any
    eur: any
    eur_foil: any
    tix: string
}

export interface SFRelatedUris {
    gatherer: string
    tcgplayer_infinite_articles: string
    tcgplayer_infinite_decks: string
    edhrec: string
}

export interface SFPurchaseUris {
    tcgplayer: string
    cardmarket: string
    cardhoarder: string
}
