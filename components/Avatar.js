// A player's picture, or - until they set one - a 5x5 tile pattern made from their wallet address, in the same style
// as the Indie Creations mark. The pattern is mirrored left to right and never changes for a wallet.
function tiles(address) {
  const hex = String(address || '').toLowerCase().replace(/^0x/, '').padEnd(40, '0');
  const cells = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const c = col < 3 ? col : 4 - col; // mirror
      cells.push(parseInt(hex[row * 3 + c], 16) % 2 === 1);
    }
  }
  return cells;
}

export default function Avatar({ address, profile, size = 40, className = '' }) {
  const style = { width: size, height: size };
  if (profile?.avatarVersion) {
    return (
      <img
        className={`avatar ${className}`}
        style={style}
        src={`/api/profile/avatar/${address}?v=${profile.avatarVersion}`}
        alt=""
        width={size}
        height={size}
        loading="lazy"
      />
    );
  }
  return (
    <svg className={`avatar avatar-tiles ${className}`} style={style} viewBox="0 0 5 5" aria-hidden="true">
      {tiles(address).map((on, i) => on && <rect key={i} x={i % 5} y={Math.floor(i / 5)} width="1" height="1" />)}
    </svg>
  );
}
