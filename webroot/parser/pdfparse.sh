#!/bin/bash

if [ $# = 1 ]; then
	DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
	cd $DIR
	echo "InputDirectory=$DIR/incoming/$1/
OutputDirectory=$DIR/output/$1/
baseKeyWords=Target,Base,Generator,Team,Mech,Reactor,Gem
teamSectionKeyWords=team,army,marines,green,red,blue,base,yellow,Earth,Fire,Ice
teamColorsKeyWords=green,red,blue,yellow,Fire,Earth,Ice" > LFScoreParser.properties
	mkdir -p output/$1/
	mkdir -p pending/$1/
	java -jar LFScoreParser.jar
	aws s3 cp output/$1/ s3://lfstats-scorecards/ --exclude "*" --include "*.pdf" >> s3.log 2>&1
	#mv output/$1/*.pdf ../pdf/
	mv output/$1/*.xml pending/$1/
	rm output/$1/*
	rm incoming/$1/*
	exit 0
else
	exit 1
fi
