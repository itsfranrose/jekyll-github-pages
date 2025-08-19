# frozen_string_literal: true

require_relative "lib/jekyll-github-pages/version"

Gem::Specification.new do |spec|
  spec.name          = "jekyll-github-pages"
  spec.version = Jekyll::GithubPages::VERSION
  spec.required_ruby_version = ">= 3.1"
  spec.authors       = ["Francis Rosinante"]
  spec.email         = ["francis.rosinante@gmail.com"]
  spec.summary       = "This is a custom jekyll theme originally intended for my various github pages use"
  spec.homepage      = "https://github.com/itsfranrose/jekyll-github-pages"
  spec.license       = "MIT"

  spec.files = Dir.glob([
    "LICENSE",       
    "README.md",    
    "assets/**/*",   
    "_layouts/**/*", 
    "_includes/**/*",
    "_sass/**/*",    
    "_data/**/*",
    "lib/jekyll-github-pages.rb",
    "_config.yml"
  ], File::FNM_DOTMATCH).reject do |f|
    File.directory?(f) # Exclude directories themselves
  end

  spec.add_runtime_dependency "jekyll", "~> 4.2"
  spec.add_development_dependency "bundler", "~> 2.6.9"
  spec.add_development_dependency "rake", "~> 13.3"
end
