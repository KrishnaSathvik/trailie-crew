# Open Graph Image Design

## Goal

Add a static social preview image for Trailie Crew that matches the current marketing brand, so link unfurls (Slack, X, iMessage, Discord, LinkedIn) show a recognizable product card instead of a blank or favicon-only preview.

## Constraints

- Deliver as a static asset only (`1200×630` PNG). No dynamic `opengraph-image.tsx` route in this change.
- Match existing light-theme tokens and marketing copy; do not invent a new palette or product name.
- Keep the composition readable at thumbnail size (~300px wide). Avoid fine stage labels from the home `TrailIllustration`.
- Product name is **Trailie Crew** (two words). Tagline is the metadata description: *Plan trips together. Ask Trailie when you need help.*

## Visual design

### Canvas

- Size: `1200×630` px
- Path: `public/og.png`
- Background: soft off-white `#f7f8f6` with a subtle `#ecefeb` wash (no flat single-color slab; keep atmosphere quiet and on-brand)
- Accent: forest sage `#34584a`
- Muted text: `#626863`
- Foreground text: `#171a18`

### Layout (split)

**Left (~55% width)**

- App mark: cream rounded tile with the existing winding-trail icon (sourced from `public/android-chrome-512x512.png` or equivalent mark art)
- Wordmark: **Trailie Crew** in a bold clean sans (Geist-like weight/spacing)
- Tagline under the name in muted weight, wrapping to at most two lines

**Right (~45% width)**

- Simplified trail-to-summit motif inspired by `TrailIllustration`: soft mountain silhouettes in accent greens, dashed climbing route, a few waypoint dots, and a stronger summit marker
- No waypoint labels or “versioned · with sources” microcopy (unreadable in previews)

### Typography and density

- Brand name is the dominant text signal; tagline is secondary
- Generous margin from edges (≥48px) so crop-safe platforms do not clip mark or copy
- No cards, badges, CTA buttons, stats, or promotional chips

## Metadata wire-up

Update root `src/app/layout.tsx` metadata so Open Graph and Twitter card previews reference the asset:

- `openGraph`: title `Trailie Crew`, description matching root metadata, `images: [{ url: "/og.png", width: 1200, height: 630, alt: "Trailie Crew" }]`
- `twitter`: `card: "summary_large_image"`, same image

`metadataBase` already points at the production application URL, so relative `/og.png` resolves correctly.

## Out of scope

- Dark-theme OG variant
- Per-route or per-share-token OG images
- Regenerating favicons or the app icon
- Marketing-site (trailiecrew.com) asset deployment beyond what this app repo publishes

## Verification

- Confirm `public/og.png` is exactly `1200×630` (or clearly intended for that aspect ratio without letterboxing).
- Confirm root metadata references `/og.png` for both Open Graph and Twitter.
- Spot-check that the mark, name, and tagline remain legible when the image is scaled to ~300×157.
- Optional: validate with a local Next metadata dump or a social debugger after deploy.
