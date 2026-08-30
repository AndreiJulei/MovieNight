You are given a task to integrate an existing React component in the codebase

The codebase should support:
- shadcn project structure  
- Tailwind CSS
- Typescript

If it doesn't, provide instructions on how to setup project via shadcn CLI, install Tailwind or Typescript.

Determine the default path for components and styles. 
If default path for components is not /components/ui, provide instructions on why it's important to create this folder
Copy-paste this component to /components/ui folder:
```tsx
3d-animation.tsx
import React, { useEffect, useRef } from 'react';

/**
 * Renders the 3D poem animation hero section.
 */
export const PoemAnimation = ({ poemHTML, backgroundImageUrl, boyImageUrl }) => {
    const contentRef = useRef(null);

    // This effect handles the responsive scaling of the animation container.
    useEffect(() => {
        function adjustContentSize() {
            if (contentRef.current) {
                const viewportWidth = window.innerWidth;
                const baseWidth = 1000;
                const scaleFactor = viewportWidth < baseWidth ? (viewportWidth / baseWidth) * 0.9 : 1;
                contentRef.current.style.transform = `scale(${scaleFactor})`;
            }
        }

        adjustContentSize();
        window.addEventListener("resize", adjustContentSize);
        return () => window.removeEventListener("resize", adjustContentSize);
    }, []);

    return (
        <header className="hero-section">
            <div className="container">
                <div 
                    ref={contentRef} 
                    className="content" 
                    style={{ display: 'block', width: '1000px', height: '562px' }}
                >
                    <div className="container-full">
                        <div className="animated hue"></div>
                        <img className="backgroundImage" src={backgroundImageUrl} alt="An old stone courtyard at dawn" onError={(e) => e.target.style.display = 'none'} />
                        <img className="boyImage" src={boyImageUrl} alt="A man and woman practicing with swords" onError={(e) => e.target.style.display = 'none'} />
                        
                        <div className="container">
                            <div className="cube">
                                <div className="face top"></div>
                                <div className="face bottom"></div>
                                <div className="face left text" dangerouslySetInnerHTML={{ __html: poemHTML }}></div>
                                <div className="face right text" dangerouslySetInnerHTML={{ __html: poemHTML }}></div>
                                <div className="face front"></div>
                                <div className="face back text" dangerouslySetInnerHTML={{ __html: poemHTML }}></div>
                            </div>
                        </div>

                        <div className="container-reflect">
                            <div className="cube">
                                <div className="face top"></div>
                                <div className="face bottom"></div>
                                <div className="face left text" dangerouslySetInnerHTML={{ __html: poemHTML }}></div>
                                <div className="face right text" dangerouslySetInnerHTML={{ __html: poemHTML }}></div>
                                <div className="face front"></div>
                                <div className="face back text" dangerouslySetInnerHTML={{ __html: poemHTML }}></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
};



demo.tsx
import React from 'react';
import { PoemAnimation } from "@/components/ui/3d-animation";


// --- Data Configuration ---
const ANIMATION_DATA = {
    poemHTML: `
        <p>The <span>love</span> between Ayla and Leo ignited in the old courtyard, each morning their swords clashed under dawn’s glow, faces streaked with <span>dust</span> and sweat; they <span>danced</span> between parries, every laugh a spark of joy against uncertain hearts. She stepped forward with <span>courage</span>, he met her gaze with open warmth, two souls seeking a shared <span>triumph</span> in their vulnerability. When blades slipped and one <span>faltered</span>, the other caught them—forearms brushing, pulses aligned in a daring heartbeat. In failure they found grace; in triumph they discovered unity. Each moment spent <span>daring</span> to trust the other built a bond impervious to fear. At dusk, they sheathed their swords, stepping from the <span>arena</span> hand in hand, knowing love blooms not through perfection, but by <span>daring greatly</span> together.</p>
`,
    backgroundImageUrl: "https://i.ibb.co/q3XSxR9W/20250831-120144.jpg",
    boyImageUrl: "https://i.ibb.co/Y4FKvK38/20250831-113022.png"
};


/**
 * The main application component, which composes the page from different sections.
 */
export default function App() {
    // In a standard React project, you would place font links in your main public/index.html file.
    // For this environment, we assume they are available or can be added there.
    return (
        <PoemAnimation
            poemHTML={ANIMATION_DATA.poemHTML}
            backgroundImageUrl={ANIMATION_DATA.backgroundImageUrl}
            boyImageUrl={ANIMATION_DATA.boyImageUrl}
        />
    );
}
```

Extend existing Tailwind 4 index.css with this code (or if project uses Tailwind 3, extend tailwind.config.js or globals.css):
```css
@import "tailwindcss";
@import "tw-animate-css";


@keyframes left {
  100% {
    margin-left: -54000px;
  }
}

@keyframes back {
  100% {
    margin-left: -54870px;
  }
}

@keyframes right {
  100% {
    margin-left: -55740px;
  }
}

@keyframes filter-animation {
  0%, 100% {
    filter: hue-rotate(0deg);
  }
  50% {
    filter: hue-rotate(100deg);
  }
}

@keyframes zoom-in {
  0% {
    transform: scale(1);
  }
  100% {
    transform: scale(2.5);
  }
}

@keyframes blur {
  0% {
    filter: blur(0px);
  }
  100% {
    filter: blur(3px);
  }
}

@keyframes brightness {
  0% {
    filter: brightness(1) contrast(1);
  }
  100% {
    filter: brightness(0.8) contrast(1.3);
  }
}

@keyframes text-glow {
  0%, 100% {
    text-shadow: 0 0 5px rgba(255, 255, 255, 0.2);
  }
  50% {
    text-shadow: 0 0 20px rgba(255, 255, 255, 0.5);
  }
}
```
