export default function Logo({ small = false, inverse = false }) {
  const classes = ['brand', small && 'brand-small', inverse && 'brand-inverse']
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes}>
      <img
        className="brand-symbol"
        src={inverse ? '/brand/symbol-dark.svg' : '/brand/symbol-light.svg'}
        width={small ? 28 : 36}
        height={small ? 28 : 36}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <span className="brand-wordmark">StudyLoop</span>
    </span>
  );
}
