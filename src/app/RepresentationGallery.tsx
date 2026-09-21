/**
 * Representation gallery (GAME-186) — a debug surface, not the product board.
 *
 * GAME-188 owns card design, colour and motion; GAME-189 owns the semantic board. This surface exists
 * so the primitives can be inspected and qualified in a browser on real engine values:
 *
 * - the smallest shipped card, with the legibility decision and every rejection that preceded it;
 * - every family rendered at one default card size;
 * - each supported shared-whole comparison;
 * - the two shapes of refusal this layer performs instead of drawing something misleading.
 *
 * The markup states facts as `data-*` attributes (`data-fraction`, `data-selected-family`,
 * `data-rejected`, `data-card-size`) so the browser qualification can assert the projection without
 * reaching into geometry, and no component here decides anything: the fixture already chose the family.
 */

import {
  REPRESENTATION_FAMILY_LABELS,
  FractionComparison,
  RepresentationByFamily,
  type RepresentationBox,
  type RepresentationFamily,
  type RepresentationWhole,
} from "../representations";
import {
  GALLERY_COMPARISONS,
  GALLERY_DEFAULT_CARD_BOX,
  GALLERY_DEFAULT_CARD_SIZE_CSS_PX,
  GALLERY_DEFAULT_ROWS,
  GALLERY_MIN_CARD_BOX,
  GALLERY_MIN_ROWS,
  GALLERY_REFUSALS,
  type GalleryValue,
} from "./representationGalleryFixture";

function familyLabel(family: RepresentationFamily): string {
  return REPRESENTATION_FAMILY_LABELS[family];
}

type GalleryCardProps = {
  readonly family: RepresentationFamily;
  readonly value: GalleryValue;
  readonly whole: RepresentationWhole;
  readonly box: RepresentationBox;
  readonly sizeToken: "min" | "default";
};

/** One fixed-size card. The box passed to the primitive is the box the card reserves, exactly. */
function GalleryCard({ family, value, whole, box, sizeToken }: GalleryCardProps) {
  return (
    <div
      className={`fm-card fm-card--${sizeToken}`}
      data-testid="gallery-card"
      data-card-size={box.width}
      data-family={family}
    >
      <RepresentationByFamily family={family} fraction={value.form} whole={whole} box={box} />
    </div>
  );
}

/**
 * Only the first measured problem per rejected family is shown: it is the reason a lane author acts on,
 * and the full list is already asserted in the unit tests.
 */
function RejectionList({ rejections }: { readonly rejections: readonly { readonly family: RepresentationFamily; readonly problems: readonly string[] }[] }) {
  if (rejections.length === 0) {
    return <p className="gallery-note">No family was rejected before this one.</p>;
  }
  return (
    <ul className="gallery-rejections" data-testid="gallery-rejections">
      {rejections.map((rejection) => (
        <li key={rejection.family} data-rejected-family={rejection.family}>
          {`${familyLabel(rejection.family)} rejected — ${rejection.problems[0] ?? "no reason recorded"}`}
        </li>
      ))}
    </ul>
  );
}

export function RepresentationGallery() {
  return (
    <section className="panel" aria-labelledby="representation-gallery-heading" data-testid="representation-gallery">
      <h2 id="representation-gallery-heading">Representation primitives</h2>
      <p className="microcopy">
        GAME-186 primitives drawn over engine values. Debug surface only: this is not a lane, not a board
        and not production card art.
      </p>

      <h3>Smallest shipped card: {GALLERY_MIN_CARD_BOX.width} × {GALLERY_MIN_CARD_BOX.height} px</h3>
      <p className="microcopy">
        The lane order is a picture first and the written symbol last. Each row states which family was
        chosen and why the ones before it were rejected.
      </p>
      <ul className="gallery-grid" data-testid="gallery-min-rows">
        {GALLERY_MIN_ROWS.map((row) => (
          <li
            className="gallery-row"
            key={row.value.label}
            data-testid="gallery-min-row"
            data-fraction={row.value.label}
            data-selected-family={row.family ?? "none"}
            data-rejected={row.rejections.map((rejection) => rejection.family).join(",")}
          >
            <p className="gallery-row__label">
              <span className="status-value">{row.value.label}</span>
              {row.family === null ? " — no legible family" : ` → ${familyLabel(row.family)}`}
            </p>
            {row.family === null || row.whole === null ? (
              <p className="gallery-warning">This card size cannot show {row.value.label} in any of the lane's families.</p>
            ) : (
              <GalleryCard
                family={row.family}
                value={row.value}
                whole={row.whole}
                box={GALLERY_MIN_CARD_BOX}
                sizeToken="min"
              />
            )}
            <RejectionList rejections={row.rejections} />
          </li>
        ))}
      </ul>

      <h3>Every family at the default card: {GALLERY_DEFAULT_CARD_SIZE_CSS_PX} × {GALLERY_DEFAULT_CARD_SIZE_CSS_PX} px</h3>
      <p className="microcopy">
        One authored value, five families, one declared whole each. Filled parts are solid ink and empty
        parts are outlines, so the shaded quantity survives forced colors and greyscale.
      </p>
      <ul className="gallery-grid" data-testid="gallery-default-rows">
        {GALLERY_DEFAULT_ROWS.map((row) => (
          <li className="gallery-row" key={row.family} data-testid="gallery-default-row" data-family={row.family}>
            <p className="gallery-row__label">
              <span className="status-value">{row.value.label}</span>
              {` → ${familyLabel(row.family)}`}
            </p>
            <GalleryCard
              family={row.family}
              value={row.value}
              whole={row.whole}
              box={GALLERY_DEFAULT_CARD_BOX}
              sizeToken="default"
            />
          </li>
        ))}
      </ul>

      <h3>Shared-whole comparisons</h3>
      <p className="microcopy">
        Two representations may only be compared when they declare the same whole; a set pair shares its
        collection total and a number-line pair shares its axis. The comparison asserts that contract
        before it draws.
      </p>
      <ul className="gallery-comparisons" data-testid="gallery-comparisons">
        {GALLERY_COMPARISONS.map((comparison) => (
          <li className="gallery-comparison" key={comparison.key} data-comparison={comparison.key}>
            <FractionComparison
              left={{
                family: comparison.left.family,
                fraction: comparison.left.value.form,
                whole: comparison.left.whole,
              }}
              right={{
                family: comparison.right.family,
                fraction: comparison.right.value.form,
                whole: comparison.right.whole,
              }}
              box={GALLERY_DEFAULT_CARD_BOX}
            />
            <p className="gallery-note">{comparison.caption}</p>
          </li>
        ))}
      </ul>

      <h3>Refusals</h3>
      <p className="microcopy">
        The layer never shrinks a value below a legibility floor and never draws two values without a
        shared whole. Both refusals are shown with the problems they reported.
      </p>
      <ul className="gallery-refusals" data-testid="gallery-refusals">
        {GALLERY_REFUSALS.map((refusal) => (
          <li key={refusal.key} data-testid="gallery-refusal" data-refusal-key={refusal.key}>
            <p className="gallery-row__label">{refusal.title}</p>
            <p className="gallery-note">{refusal.detail}</p>
            <ul className="gallery-rejections">
              {refusal.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
