#!/bin/bash

# this is for running the gulpfile which builds and then runs locally with livereload

export PATH="$HOME/.rbenv/bin:$PATH"
eval "$(rbenv init -)"

bundle install
bundle update
npm start
