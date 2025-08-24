#!/bin/bash

# this is for building using the gulpfile

export PATH="$HOME/.rbenv/bin:$PATH"
eval "$(rbenv init -)"

bundle install
bundle update
npm build
