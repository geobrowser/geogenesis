/**
 * The Geo mark: the ring over the plinth, in one colour. Plain markup with no hooks, so the OG image
 * renderers draw it through Satori and the app draws it in the DOM, and the two cannot drift.
 */
export function GeoMark({ size, color = 'currentColor' }: { size: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M14.3558 14.5685C14.5064 14.824 14.4369 15.1543 14.1838 15.3089C12.9706 16.0499 11.5349 16.4784 9.99619 16.4784C8.46312 16.4784 7.0323 16.053 5.82196 15.3171C5.56819 15.1628 5.49827 14.832 5.64911 14.5761L9.51384 8.02041C9.73427 7.6465 10.2751 7.6465 10.4955 8.02041L14.3558 14.5685ZM4.94964 16.9532C4.66671 16.787 4.29709 16.8695 4.13047 17.1522L2.95809 19.1408C2.73416 19.5207 3.00801 20 3.44895 20H16.5604C17.0014 20 17.2752 19.5207 17.0513 19.1408L15.8745 17.1447C15.7077 16.8618 15.3376 16.7795 15.0546 16.9462C13.5791 17.8155 11.8478 18.3159 9.99619 18.3159C8.14957 18.3159 6.4226 17.8182 4.94964 16.9532Z"
        fill={color}
      />
      <circle
        cx="9.99613"
        cy="8.49619"
        r="7.4278"
        transform="rotate(-180 9.99613 8.49619)"
        stroke={color}
        strokeWidth="2.13675"
      />
    </svg>
  );
}
