import { usingBackend } from './share-client'
const steps = [
  {
    title: 'Choose what to share',
    text: 'Paste a note, link, or code snippet, or choose a file under 20 MB. Keep it available for 10 or 30 minutes.',
  },
  {
    title: 'Generate your bridge',
    text: 'Get a six-character code, a sharing link, and a QR code. Each one leads to the same content.',
  },
  {
    title: 'Receive it on another device',
    text: 'Enter the code in Receive, or open the link to fill it in. Select View content to retrieve it; scanning the QR code opens that same link.',
  },
  {
    title: 'Copy or download',
    text: 'Copy the text or download the file. You can retrieve it again until it expires; receiving does not delete it.',
  },
]

const questions = [
  {
    question: 'Can I share between Chrome, Safari, and my phone?',
    answer: usingBackend
      ? 'Chrome and Safari on this computer can now retrieve the same newly generated codes through the local Firebase server. Keep the app and emulators running. Phone sharing needs a website address reachable from the phone; a 127.0.0.1 link always points to the device opening it. This website is not deployed yet.'
      : 'Not yet. This version is a local demo: content stays in the browser and profile where you created it. Try another tab at the same address in that browser. Cross-browser and cross-device sharing need the shared backend, which is not connected yet.',
  },
  {
    question: 'What can I share, and how much?',
    answer:
      'Share either plain text or one file per code. Text supports up to 100,000 words and 20 MiB, including links, code, emoji, and non-English text. Files such as PDF, JPG, PNG, and ZIP must be smaller than 20 MB (20,000,000 bytes). Text keeps its line breaks; files are downloaded without an inline preview.',
  },
  {
    question: 'Who can read my shared content?',
    answer: usingBackend
      ? 'Anyone with an active code or link can access its content. The QR code contains the same link. TextBridge does not provide end-to-end encryption or password protection. This local test stores content in Firebase emulators on your computer. Use sample content while testing.'
      : 'Anyone with an active sharing code or link can access its content. The QR code contains the same link. TextBridge does not provide end-to-end encryption or password protection. In this demo, data is stored unencrypted in your browser, so use sample content rather than sensitive information.',
  },
  {
    question: 'When does my code expire?',
    answer:
      'Choose 10 minutes (the default) or 30 minutes when sending. You can retrieve the content repeatedly until that time; receiving it does not extend its lifetime. After expiry it becomes unavailable in TextBridge. Copies and files already downloaded remain with the recipient.',
  },
  {
    question: 'Why does my code say “not found or expired”?',
    answer: usingBackend
      ? 'Check the six-character code and its expiration time. Lowercase letters, spaces, and hyphens are accepted. The letters O and I and numbers 0 and 1 are never used. Old browser-only demo codes are not copied to Firebase. Codes can also become unavailable if local emulator data is cleared.'
      : 'Check the six-character code and its expiration time. Lowercase letters, spaces, and hyphens are accepted. The letters O and I and the numbers 0 and 1 are never used. For this local demo, also check that you are in the original browser and profile, at the same address: localhost and 127.0.0.1 have separate storage. Clearing browser data can remove your shared items.',
  },
  {
    question: 'Do I need an account?',
    answer:
      'No account or sign-in is needed to send or receive. Keep the sharing code or link until you are finished; there is no account history to recover a lost code.',
  },
]

export default function HelpSections() {
  return (
    <div className="help-sections">
      <section
        id="how-it-works"
        aria-labelledby="how-title"
        tabIndex={-1}
        className="help-section"
      >
        <p className="eyebrow">A little less back and forth</p>
        <h2 id="how-title">How TextBridge works</h2>
        <p className="help-intro">
          From a thought on one screen to a code you can keep.
        </p>
        <ol className="how-steps">
          {steps.map((step, index) => (
            <li key={step.title}>
              <span className="step-number" aria-hidden="true">
                0{index + 1}
              </span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
        <p className="help-demo-note">
          <strong>
            {usingBackend ? 'Testing locally?' : 'Trying the demo?'}
          </strong>{' '}
          {usingBackend
            ? 'Open the sharing link in another browser on this computer. Both browsers use the same local Firebase backend. Phone sharing is not connected yet.'
            : 'Open the sharing link in another tab of this browser. A phone scanning the QR code cannot retrieve your local content yet.'}
        </p>
      </section>

      <section
        id="faq"
        aria-labelledby="faq-title"
        tabIndex={-1}
        className="help-section"
      >
        <p className="eyebrow">Good to know</p>
        <h2 id="faq-title">Frequently asked questions</h2>
        <p className="help-intro">
          A few answers before you send your next idea.
        </p>
        <div className="faq-list">
          {questions.map(({ question, answer }) => (
            <details key={question}>
              <summary>
                {question}
                <span className="faq-indicator" aria-hidden="true" />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
      <section
        id="contact"
        aria-labelledby="contact-title"
        tabIndex={-1}
        className="help-section contact-section"
      >
        <p className="eyebrow">Contact</p>
        <h2 id="contact-title">Get in touch</h2>
        <p className="help-intro">
          Have a question or found an issue? The public TextBridge support
          contact has not been set up yet.
        </p>
        <div className="contact-panel">
          <strong>For now, check the FAQ above.</strong>
          <p>
            This preview does not collect or send contact messages. A support
            address can be added before TextBridge is shared publicly.
          </p>
        </div>
      </section>
    </div>
  )
}
