import gaiaLogo from '~/assets/gaia-logo.svg';

const App = () => (
  <div className="bg-bg text-fg flex h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
    <img alt="GAIA" className="w-64 max-w-full" src={gaiaLogo} />
    <p className="text-fg-mute font-mono text-xs tracking-[0.2em] uppercase">
      Dashboard
    </p>
    <p className="font-display text-fg-dim max-w-md text-lg font-light italic">
      Everything you&apos;ve built, at a glance.
    </p>
  </div>
);

export default App;
