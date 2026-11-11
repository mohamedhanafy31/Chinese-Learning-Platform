'use client';

/**
 * The last resort: it replaces the root layout, so it cannot use the app's
 * styles, fonts or translations. It is plain inline-styled markup, in the
 * three languages at once, in the palette's own colours.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '2rem 1rem',
          background: '#f4f7fa',
          color: '#0e2366',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
        }}
      >
        <main role="alert" style={{ maxWidth: '34rem' }}>
          <h1 style={{ fontSize: '2rem', margin: '0 0 1rem' }}>
            حدث خطأ غير متوقع
          </h1>
          <p
            style={{ margin: '0 0 0.5rem', lineHeight: 1.8, color: '#1c3f94' }}
          >
            تعذّر عرض هذه الصفحة. حاول مرة أخرى بعد قليل.
          </p>
          <p
            dir="ltr"
            lang="en"
            style={{ margin: '0 0 0.5rem', lineHeight: 1.8, color: '#1c3f94' }}
          >
            Something went wrong and the page could not be shown.
          </p>
          <p
            dir="ltr"
            lang="zh"
            style={{ margin: '0 0 2rem', lineHeight: 1.8, color: '#1c3f94' }}
          >
            页面出错了，请稍后再试。
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: '3.5rem',
              padding: '0 2rem',
              borderRadius: '9999px',
              border: 0,
              background: '#0e2366',
              color: '#f4f7fa',
              fontSize: '1.125rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            حاول مرة أخرى · Try again · 重试
          </button>
        </main>
      </body>
    </html>
  );
}
