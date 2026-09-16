Pod::Spec.new do |s|
  s.name = 'CoupleMotion'
  s.version = '1.0.0'
  s.summary = 'Reconocimiento de actividad para CoupleApp'
  s.description = s.summary
  s.license = { :type => 'Proprietary' }
  s.author = 'CoupleApp'
  s.homepage = 'https://supabase.pruebahomelab.es'
  s.source = { :path => '.' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CoreMotion'
  s.source_files = '**/*.swift'
end
