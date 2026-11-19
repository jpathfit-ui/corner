# Corner: Boxing Coach

A spoken boxing coach for bag work and shadow boxing at home. It calls combinations out loud, keeps round and rest time, rings the bell, claps a warning before each round ends, and schedules recovery rounds where you set your own pace.

Static files only. No server, no accounts. Data stays on the device.

## Put it on your iPhone

1. Create a new GitHub repository (suggested name: `corner`) and upload everything in this folder, keeping the folder structure.
2. In the repository settings, turn on GitHub Pages (deploy from the main branch, root folder).
3. Open `https://<your-username>.github.io/corner/` in Safari, tap Share, then Add to Home Screen.
4. Updating later: replace the changed files, wait a minute or two for Pages to rebuild, swipe the app closed, reopen it.

The home screen icon is copied once when the app is added. A changed icon means deleting and re-adding the app.

## What is in it

| Piece | What it does |
| --- | --- |
| Train | Pick a program, preview the plan, test audio, start. |
| Programs | Rounds, round length, rest, get-ready, level, recovery rounds, voice, delivery, and what the coach calls. Includes a Free Boxing mode. |
| Prompts | Every phrase the coach can say. Edit, disable, add your own, reset edited ones. |
| Settings | Volumes, bell strikes, clap and warning timing, timer color and size, screen awake, device voice fallback, editable fixed calls, backup. |

### Recovery rounds

The program schedules them, so nobody touches the phone mid-workout. The coach announces "Recovery round. Your pace." You choose to ease off or push harder. Placement can be spread evenly, random each workout, or hand-picked rounds.

### Warnings

Bell at the start of each round, two claps at ten seconds left (configurable 5 to 20), optional three-tick cue at five seconds, bell at the end. Rest periods get the same clap warning before the next round.

### Coach talk: cues, needling and milestones

- **Short Cues** are the quick corrections a coach repeats all session: Hands up, Chin down, Move your feet, Harder, Faster, Breathe. They fire often and the same one can repeat within a couple of calls.
- **Needling** is the pushy stuff: Do not get sloppy, You are looking tired, Do not quit on me now. Low by default, off in the Technique program.
- **Milestones** are tied to how far through a round you are: an opener in round one, then a quarter, halfway, three quarters and ninety percent. The final round has its own dramatic lines ("This is what makes champions"). Rounds under a minute get a lighter touch.
- **Frequency** is set per prompt (Rarely, Sometimes, Often, Constantly) from the Prompts tab. Hands up and Chin down are Constantly, so they dominate. The weights are a first draft built from general coaching sources and judgment, not measured data. Adjust them to match what your own coaches say.
- Each program sets how much of each category it uses under What the Coach Calls, and can switch milestones off.
- Coach talk is generic, with no names, so every line works as a recorded clip.

### Levels

Every combination is tagged Novice, Intermediate or Advanced. A program draws from its own level and below, favoring its own level. Intermediate is the launch level. Add novice and advanced programs from the Programs tab.

## Voices

Two coaches, Male Coach and Female Coach. Each program picks one. Today they speak using the voice you choose for that gender under Settings, Device Voice Fallback (Hear Voices plays both), shaped by style (calm, firm, urgent) and intensity (measured, driven, fierce). On iPhone, download Enhanced or Premium voices in Settings, Accessibility, Read and Speak, Voices for a big quality jump.

For real coach energy, drop in recorded clips. The app uses a clip when one exists and falls back to the device voice when it does not, so you can fill clips in gradually.

### Generating clips with ElevenLabs

The coach can say 381 clips across three delivery styles (calm, firm, urgent), about 11,900 characters in total. Both tools below make them most important first, and stop before your credits run out. Run again later and they carry on where they stopped.

**Clip Maker (no install).** Open `tools/clip-maker.html` in Chrome. Paste your API key and Voice ID, choose Male Coach or Female Coach, then use the steps on the page: Check Credits, Test One Clip, Show Plan, Start Generating, Download Clips Zip. Unzip into the Corner folder so the `audio` folder merges, then upload to GitHub. Clips are saved in the browser as they are made, so closing the page wastes nothing.

**Command line (needs Node 18 or newer).**

```
export ELEVENLABS_API_KEY=your_key_here
node tools/generate-clips.js --dry-run
node tools/generate-clips.js --voice-id VOICE_ID --folder m1 --limit 3
node tools/generate-clips.js --voice-id VOICE_ID --folder m1
```

Order: firm cues, milestones and round calls first, then firm combinations, then urgent cues and push lines, then calm recovery and rest lines, then everything else.

How each phrase is styled lives at the top of `tools/clipjobs.js`: combinations are split per punch ("Jab! Cross! Hook!"), urgent lines get `[shouting]` with the last word in capitals, calm lines get `[calm, steady voice]`, needling lines get `[annoyed]`. Speeds default to 1.0 calm, 1.1 firm and 1.2 urgent. After editing, run `node tools/build-clip-maker.js` to refresh the browser tool.

To list the phrases without generating, `node tools/list-phrases.js` writes `tools/phrases.csv`. Clips are saved as `audio/<voice>/<style>/<slug>.mp3`, for example `audio/m1/firm/hands-up.mp3`. Voice ids: `m1` (male) and `f1` (female).

If a clip exists for a phrase but not for the requested style, the app uses the same voice in another style before falling back to the device voice.

With one voice, the free plan's 10,000 credits cover roughly the first five groups in the generator's order (about 7,500 characters).

## Known limits

- Built and tested in a headless phone-sized browser. It has not been tested on a real iPhone yet. Check audio levels, the wake lock and speech first.
- Screen lock audio is not handled by design. The app asks the phone to keep the screen awake while a workout runs. Wake lock support depends on the iOS version.
- Device voices vary by phone. Pick the best ones under Settings, Device Voice Fallback.
- Browsers need a tap before they allow sound, so audio starts when you press Start Workout or Test Audio.

## Parking lot

- Record or upload your own voice clips inside the app.
- Pull clips from online libraries.
- Color options beyond black, silver and gray.
- Beginner and advanced program packs.
- Combination callouts by punch number instead of name.
