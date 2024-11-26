/**
 * Image entities and Image Blocks are functionally the same thing. The
 * relation consuming the entity is what gives it contextual meaning. e.g.,
 * if the Image is consumed by an Avatar relation, then we know the image
 * is an avatar. If it's consumed by a Block relation, then we know the
 * image is a block.
 */
export { make } from '../image';
