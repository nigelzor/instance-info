.DELETE_ON_ERROR:
.SUFFIXES:

include Makefile.regions

ALL_DATA = $(addsuffix .json,$(addprefix packages/webapp/public/data/ec2-,$(REGIONS)))

.PHONY: all
all: packages/webapp/public/data/options.json $(ALL_DATA)

Makefile.regions: packages/webapp/public/data/regions.json
	jq -r '.[].regionCode' $< | xargs | awk '{ print "REGIONS = " $$0 }' > $@

work:
	mkdir -p work

work/%.ec2: packages/preprocess/src/fetch.js | work
	node $^

work/%.json: packages/preprocess/src/preprocess.js work/%.ec2
	node $^ > $@

packages/webapp/public/data:
	mkdir -p packages/webapp/public/data

packages/webapp/public/data/regions.json: packages/preprocess/src/fetch.js | packages/webapp/public/data
	node $^

packages/webapp/public/data/ec2-%.json: work/%.json | packages/webapp/public/data
	jq -c 'del(.types,.options)' $< > $@

packages/webapp/public/data/options.json: packages/preprocess/src/merge.js $(addsuffix .json,$(addprefix work/,$(REGIONS))) | packages/webapp/public/data
	node $^ > $@
