import { useState } from 'react'
import { aboutStory } from './about-story'

export default function AboutSection() {
  const [language, setLanguage] = useState<'en' | 'my'>('en')
  const story = aboutStory[language]

  return (
    <section
      id="about"
      aria-labelledby="about-title"
      tabIndex={-1}
      className="help-section about-section"
    >
      <div className="story-heading">
        <div lang={language}>
          <p className="eyebrow">{story.eyebrow}</p>
          <h2 id="about-title">{story.title}</h2>
        </div>
        <div
          className="story-language"
          role="group"
          aria-label="Story language"
        >
          <button
            type="button"
            lang="en"
            aria-pressed={language === 'en'}
            aria-controls="about-story"
            onClick={() => setLanguage('en')}
          >
            English
          </button>
          <button
            type="button"
            lang="my"
            aria-pressed={language === 'my'}
            aria-controls="about-story"
            onClick={() => setLanguage('my')}
          >
            မြန်မာ
          </button>
        </div>
      </div>
      <div id="about-story" className="story-copy" lang={language}>
        {story.paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
    </section>
  )
}
