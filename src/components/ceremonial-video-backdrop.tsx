import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';

const ceremonialMarch = require('@/assets/videos/ceremonial-knight-march-loop.mp4');

export function CeremonialVideoBackdrop() {
  const isFocused = useIsFocused();
  const [reduceMotion, setReduceMotion] = useState(true);
  const player = useVideoPlayer(ceremonialMarch, (videoPlayer) => {
    videoPlayer.keepScreenOnWhilePlaying = false;
    videoPlayer.loop = true;
    videoPlayer.muted = true;
  });

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion
    );

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (isFocused && !reduceMotion) {
      player.play();
    } else {
      player.pause();
    }
  }, [isFocused, player, reduceMotion]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image
        contentFit="cover"
        source={require('@/assets/images/ceremonial-knight-march-poster.jpg')}
        style={StyleSheet.absoluteFill}
      />
      {!reduceMotion && isFocused && (
        <VideoView
          contentFit="cover"
          fullscreenOptions={{ enable: false }}
          nativeControls={false}
          player={player}
          style={StyleSheet.absoluteFill}
          surfaceType="textureView"
        />
      )}
      <LinearGradient
        colors={[
          'rgba(5, 11, 18, 0.34)',
          'rgba(5, 11, 18, 0.68)',
          'rgba(5, 11, 18, 0.48)',
          'rgba(5, 11, 18, 0.82)',
        ]}
        locations={[0, 0.32, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.screenFrame} />
    </View>
  );
}

const styles = StyleSheet.create({
  screenFrame: {
    borderColor: 'rgba(201, 143, 28, 0.45)',
    borderRadius: 22,
    borderWidth: 1,
    bottom: 7,
    left: 7,
    position: 'absolute',
    right: 7,
    top: 7,
  },
});
