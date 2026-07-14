Pod::Spec.new do |s|
  s.name = 'F1Haptics'
  s.version = '0.1.0'
  s.summary = 'Core Haptics textures for F1 Replay'
  s.description = 'A local Expo module for authoring and playing F1 Replay haptic textures.'
  s.author = 'F1 Replay'
  s.homepage = 'https://docs.expo.dev/modules/'
  s.platforms = { :ios => '16.4' }
  s.source = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
