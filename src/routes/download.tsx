import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Apple, BookDown, CheckCircle2, Download, Laptop, MonitorDown,
  Smartphone, WifiOff,
} from "lucide-react";

/**
 * Official store and signed-package links are deliberately withheld until
 * a verified release exists. Do not guess App Store IDs, Play package URLs
 * or claim that CI debug artifacts are public production installers.
 */
/**
 * Only add official, manually verified listing URLs or tested, versioned HTTPS
 * installer URLs. Null keeps the action visibly unavailable. Never point at
 * debug artifacts or guess store application identifiers.
 */
const verifiedReleaseLinks: Record<string, string | null> = {
  googlePlay: null,
  appleIos: null,
  microsoftStore: null,
  windowsExe: null,
  appleMac: null,
  flathub: null,
  linuxAppImage: null,
  linuxDeb: null,
};

const platforms = [
  { name: "Android", icon: Smartphone, channel: "Planned: Google Play + other Android stores", detail: "Not yet released. Until then, install the web app from Chrome (see below).", actions: [{ id: "googlePlay", label: "Get it on Google Play" }] },
  { name: "iPhone & iPad", icon: Apple, channel: "Planned: Apple App Store", detail: "Not yet released and not yet submitted to Apple. Until then, add the web app to your Home Screen from Safari (see below).", actions: [{ id: "appleIos", label: "View on App Store" }] },
  { name: "Windows", icon: MonitorDown, channel: "Planned: Microsoft Store", detail: "Not yet released; the Microsoft Store listing is in preparation. A direct setup file will only be offered once it is signed and verified.", actions: [{ id: "microsoftStore", label: "Microsoft Store" }, { id: "windowsExe", label: "Download .exe" }] },
  { name: "macOS", icon: Laptop, channel: "Planned: Mac App Store", detail: "Not yet released. Until then, add the web app to the Dock from Safari or install it from Chrome (see below).", actions: [{ id: "appleMac", label: "Mac App Store" }] },
  { name: "Linux", icon: Download, channel: "Planned: Flathub, Snap Store + direct downloads", detail: "Not yet released. Downloads will only appear here after a verified release.", actions: [{ id: "flathub", label: "Flathub" }, { id: "linuxAppImage", label: "Download .AppImage" }, { id: "linuxDeb", label: "Download .deb" }] },
] as const;

export const Route = createFileRoute("/download")({
  head: () => ({
    meta: [
      { title: "Download Seeparah apps — Android, iOS, Windows, macOS & Linux" },
      { name: "description", content: "Seeparah native reading apps for phones and computers, with offline book editions, local highlights and page annotations. See current release availability." },
    ],
    links: [{ rel: "canonical", href: "https://seeparah.com/download" }],
  }),
  component: DownloadPage,
});

function DownloadPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-12 sm:px-6 sm:pt-16">
      <div className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Seeparah on your devices</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          Your library, wherever you read
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
          Our native reader is being prepared for phones, tablets and computers. Once an app is
          released, download a complete available edition while online, then read and keep
          highlights, page drawings and reading progress on your device without internet.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link to="/library" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
            <BookDown className="h-4 w-4" /> Read on the website
          </Link>
          <a href="#platforms" className="inline-flex min-h-11 items-center rounded-xl border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary">
            View app availability
          </a>
        </div>
      </div>

      <section aria-labelledby="offline-heading" className="mt-12 grid gap-4 rounded-2xl border border-border bg-card p-6 sm:grid-cols-3 sm:p-8">
        <div>
          <WifiOff className="mb-3 h-6 w-6 text-primary" aria-hidden="true" />
          <h2 id="offline-heading" className="font-semibold text-foreground">Read without internet</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Save an available book edition to the app before you go offline.</p>
        </div>
        <div>
          <CheckCircle2 className="mb-3 h-6 w-6 text-primary" aria-hidden="true" />
          <h3 className="font-semibold text-foreground">Keep your highlights</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Highlights, notes, bookmarks and progress are stored on the device.</p>
        </div>
        <div>
          <BookDown className="mb-3 h-6 w-6 text-primary" aria-hidden="true" />
          <h3 className="font-semibold text-foreground">Write on book pages</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Draw, erase and save handwriting locally in the native reader.</p>
        </div>
      </section>

      <section id="platforms" aria-labelledby="platforms-heading" className="mt-14 scroll-mt-24">
        <h2 id="platforms-heading" className="font-display text-2xl font-semibold text-foreground">Choose your device</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          App development is underway. There are currently no verified public store listings or
          signed desktop downloads. Windows and Linux will offer both store listings and direct installers. Download links will only appear after a release is verified.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {platforms.map(({ name, icon: Icon, channel, detail, actions }) => (
            <article key={name} className="rounded-2xl border border-border bg-card p-6">
              <Icon className="h-8 w-8 text-primary" aria-hidden="true" />
              <h3 className="mt-4 font-display text-xl font-semibold text-foreground">{name}</h3>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{channel}</p>
              <p className="mt-4 min-h-12 text-sm leading-6 text-muted-foreground">{detail}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {actions.map((action) => {
                  const href = verifiedReleaseLinks[action.id];
                  return href ? (
                    <a
                      key={action.id}
                      href={href}
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      {action.label}
                    </a>
                  ) : (
                    <span key={action.id} aria-disabled="true" className="inline-flex min-h-11 items-center rounded-xl border border-border bg-secondary px-4 py-2 text-sm font-medium text-muted-foreground">
                      {action.label} — coming soon
                    </span>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 rounded-2xl border border-border bg-secondary/40 p-6 sm:p-8">
        <h2 className="font-display text-xl font-semibold text-foreground">Already reading in your browser?</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          You can continue reading at seeparah.com today. On supported browsers, use the browser's
          <strong> Install app</strong> or <strong>Add to Home Screen</strong> option for quick access.
          The website's installation is not the same as downloading complete offline books;
          full offline reading is a feature of the native app.
        </p>
        <ul className="mt-4 space-y-2 text-sm leading-6 text-muted-foreground">
          <li><strong className="text-foreground">iPhone &amp; iPad:</strong> open seeparah.com in Safari, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</li>
          <li><strong className="text-foreground">Android:</strong> open seeparah.com in Chrome, tap the <strong>⋮</strong> menu, then <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
          <li><strong className="text-foreground">Windows, macOS &amp; Linux:</strong> in Chrome or Edge, click the <strong>Install</strong> icon in the address bar. On a Mac with Safari, choose <strong>File → Add to Dock</strong>.</li>
        </ul>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Offline copies belong to the device where they were saved. Account-based synchronization
          between devices is not yet available. Previously downloaded content may require an
          online rights/status check when connectivity returns.
        </p>
      </section>
    </main>
  );
}
