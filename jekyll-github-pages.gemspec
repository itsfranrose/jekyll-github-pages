# frozen_string_literal: true

Gem::Specification.new do |spec|
  spec.name          = "jekyll-github-pages"
  spec.version       = "0.1.0"
  spec.authors       = ["Francis Rosinante"]
  spec.email         = ["francis.rosinante@gmail.com"]

  spec.summary       = "This is a custom jekyll theme originally intended for my various github pages use"
  spec.homepage      = "https://github.com/itsfranrose/jekyll-github-pages"
  spec.license       = "MIT"

  spec.files         = `git ls-files -z`.split("\x0").select { |f| f.match(%r!^(assets|_layouts|_includes|_sass|LICENSE|README)!i) }

  spec.add_runtime_dependency "jekyll", "~> 3.10"

  spec.add_development_dependency "bundler", "~> 2.6.9"
  spec.add_development_dependency "rake", "~> 13.3"
end
