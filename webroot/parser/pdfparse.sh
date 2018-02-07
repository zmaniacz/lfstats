#!/bin/bash

if [ $# = 1 ]; then
	DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
	cd $DIR
	echo "InputDirectory=$DIR/incoming/$1/
OutputDirectory=$DIR/output/$1/
baseKeyWords=Target,Base,Generator,Team,Mech,Reactor
teamSectionKeyWords=team,army,marines,green,red,blue,base,yellow
teamColorsKeyWords=green,red,blue,yellow" > LFScoreParser.properties
	mkdir -p output/$1/
	mkdir -p pending/$1/
	java -jar LFScoreParser.jar
	s3cmd put -P output/$1/*.pdf s3://lfstatsscorecards/ --rexclude ".*" --rinclude "^[0-9]*.pdf$"
	#mv output/$1/*.pdf ../pdf/
	mv output/$1/*.xml pending/$1/
	rm output/$1/*
	rm incoming/$1/*
	exit 0
else
	exit 1
fi
