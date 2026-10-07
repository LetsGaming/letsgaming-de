import sharp from "sharp";

/**
 * A dark version of GitHub's generated repository card.
 *
 * The card is a fixed white image: dark text on white, a coloured language bar, and
 * the owner's avatar in the top-right corner. Inverting the whole image gives a dark
 * card, but it also inverts the avatar, which turns a photo into a negative. So the
 * card is inverted (with the hue turned back so the language colours stay recognisable)
 * and the avatar is put back as it was.
 *
 * Avatars come in different shapes: a photo fills its slot, a circular logo sits in it
 * with white corners. Pasting the slot back as a square would leave a white box around a
 * logo, so the avatar's own outline is found instead. White that is connected to the
 * slot's edge is card background and is left dark; everything else, including white
 * inside the logo, is kept exactly as drawn.
 */

/** The generated card's layout: 1200x600 with the avatar in a 200px slot at (920, 80).
 *  GitHub's generic placeholder (a repository it cannot render) is a different size and
 *  is returned unchanged. */
const CARD = { width: 1200, height: 600 } as const;
const AVATAR_SLOT = { x: 920, y: 80, size: 200 } as const;

/** The language bar: a full-width strip of flat colour along the bottom edge. A
 *  repository with no detected language has none, and the strip is plain background. */
const LANGUAGE_BAR_TOP = 576;

/** A pixel whose channels are all at least this bright is card background. */
const BACKGROUND_MIN = 235;

/** Whether `info` describes a repository card this module knows the layout of. */
function isRepoCard(width: number, height: number): boolean {
	return width === CARD.width && height === CARD.height;
}

/** Mark the slot pixels that are card background: near-white and connected to the
 *  slot's border. Returns one flag per pixel (1 = background). */
function backgroundMask(
	rgb: Buffer,
	cardWidth: number,
	left: number,
	top: number,
	size: number,
): Uint8Array {
	const isWhite = (x: number, y: number) => {
		const i = ((top + y) * cardWidth + (left + x)) * 3;
		return (
			rgb[i]! >= BACKGROUND_MIN &&
			rgb[i + 1]! >= BACKGROUND_MIN &&
			rgb[i + 2]! >= BACKGROUND_MIN
		);
	};

	const mask = new Uint8Array(size * size);
	const stack: number[] = [];
	const push = (x: number, y: number) => {
		const k = y * size + x;
		if (mask[k] || !isWhite(x, y)) return;
		mask[k] = 1;
		stack.push(k);
	};

	for (let i = 0; i < size; i++) {
		push(i, 0);
		push(i, size - 1);
		push(0, i);
		push(size - 1, i);
	}
	while (stack.length) {
		const k = stack.pop()!;
		const x = k % size;
		const y = (k - x) / size;
		if (x > 0) push(x - 1, y);
		if (x < size - 1) push(x + 1, y);
		if (y > 0) push(x, y - 1);
		if (y < size - 1) push(x, y + 1);
	}

	// One pixel inwards: the anti-aliased rim of the avatar is blended with white and
	// would show as a light halo on the dark card.
	const grown = mask.slice();
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			if (mask[y * size + x]) continue;
			if (
				(x > 0 && mask[y * size + x - 1]) ||
				(x < size - 1 && mask[y * size + x + 1]) ||
				(y > 0 && mask[(y - 1) * size + x]) ||
				(y < size - 1 && mask[(y + 1) * size + x])
			) {
				grown[y * size + x] = 1;
			}
		}
	}
	return grown;
}

/** Whether the card has a language bar: the bottom row is not all background. The bar
 *  always spans the full width, so any coloured pixel in that row means it is there. A
 *  pale language colour is still a colour, so this does not ask the bar to be dark. */
function hasLanguageBar(rgb: Buffer, width: number, height: number): boolean {
	const y = height - 1;
	for (let x = 0; x < width; x++) {
		const i = (y * width + x) * 3;
		if (
			rgb[i]! < BACKGROUND_MIN ||
			rgb[i + 1]! < BACKGROUND_MIN ||
			rgb[i + 2]! < BACKGROUND_MIN
		) {
			return true;
		}
	}
	return false;
}

/** The dark card as a PNG, or the input unchanged when it is not a card this module
 *  knows the layout of. The language bar keeps the colours GitHub assigns each
 *  language, which an inversion would turn into other colours (JavaScript yellow
 *  becomes brown), so it is put back as it was, like the avatar. */
export async function darkenRepoCard(card: Buffer): Promise<Buffer> {
	const flat = () => sharp(card).flatten({ background: "#ffffff" }).removeAlpha();
	const { data, info } = await flat().raw().toBuffer({ resolveWithObject: true });
	if (!isRepoCard(info.width, info.height)) return card;

	const { x: left, y: top, size } = AVATAR_SLOT;
	const background = backgroundMask(data, info.width, left, top, size);

	const avatar = Buffer.alloc(size * size * 4);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const k = y * size + x;
			const from = ((top + y) * info.width + (left + x)) * 3;
			avatar[k * 4] = data[from]!;
			avatar[k * 4 + 1] = data[from + 1]!;
			avatar[k * 4 + 2] = data[from + 2]!;
			avatar[k * 4 + 3] = background[k] ? 0 : 255;
		}
	}

	const restore: sharp.OverlayOptions[] = [
		{ input: avatar, raw: { width: size, height: size, channels: 4 }, left, top },
	];
	if (hasLanguageBar(data, info.width, info.height)) {
		restore.push({
			input: await flat()
				.extract({ left: 0, top: LANGUAGE_BAR_TOP, width: info.width, height: info.height - LANGUAGE_BAR_TOP })
				.png()
				.toBuffer(),
			left: 0,
			top: LANGUAGE_BAR_TOP,
		});
	}

	const inverted = await flat().negate().modulate({ hue: 180 }).png().toBuffer();
	return sharp(inverted).composite(restore).png().toBuffer();
}
