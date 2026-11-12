import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { ColinReel } from './Reel.jsx';
import { timeline, FPS } from './timeline.js';
import sample from '../props.sample.json';

function Root() {
  return (
    <Composition
      id="ColinReel"
      component={ColinReel}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={timeline(sample).total}
      defaultProps={sample}
      calculateMetadata={({ props }) => ({ durationInFrames: timeline(props, FPS).total })}
    />
  );
}
registerRoot(Root);
