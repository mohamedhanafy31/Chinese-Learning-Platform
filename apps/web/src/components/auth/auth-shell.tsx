import { Band } from '@/components/porcelain/band';
import { Seal } from '@/components/porcelain/seal';

interface AuthShellProps {
  children: React.ReactNode;
  description: string;
  hanzi: string;
  title: string;
}

export function AuthShell({
  children,
  description,
  hanzi,
  title,
}: AuthShellProps): React.JSX.Element {
  return (
    <div className="mx-auto grid w-full max-w-[1100px] flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.85fr)]">
      <section className="px-4 py-16 sm:px-8 sm:py-20 lg:px-[72px] lg:py-24">
        <div className="max-w-md">
          <h1 className="font-display text-balance text-[clamp(2.5rem,5vw,4rem)] leading-[1.05] text-deep">
            <span className="block">{title}</span>
            <span
              lang="zh"
              className="font-brush mt-3 block text-[clamp(1.9rem,7vw,2.75rem)] font-normal tracking-[0.06em] text-cobalt lg:hidden"
            >
              {hanzi}
            </span>
          </h1>
          <p className="mt-5 text-lg leading-[1.8] text-cobalt">
            {description}
          </p>
          <div className="mt-10">{children}</div>
        </div>
      </section>

      <aside className="relative hidden min-h-[42rem] overflow-hidden rounded-2xl bg-deep px-12 py-16 text-glaze lg:flex lg:flex-col lg:items-center lg:justify-center">
        <Seal size={120} />
        <p
          lang="zh"
          className="font-brush mt-10 text-center text-5xl leading-tight tracking-[0.06em] text-wash-strong"
        >
          {hanzi}
        </p>
        <p className="mt-5 max-w-xs text-center text-lg leading-[1.8] text-wash">
          {description}
        </p>
        <div className="absolute inset-x-0 bottom-0">
          <Band
            kind="wave"
            ink="var(--color-wash-strong)"
            ground="var(--color-deep)"
          />
        </div>
      </aside>
    </div>
  );
}
