.DELETE_ON_ERROR:
.SUFFIXES:

include Makefile.regions

ALL_DATA = $(addsuffix .json,$(addprefix data/ec2-,$(REGIONS)))

.PHONY: all
all: data/options.json $(ALL_DATA)

offers/%:
	wget --compression=auto -N -r -nH https://pricing.us-east-1.amazonaws.com/offers/$*

Makefile.regions: offers/v1.0/aws/AmazonEC2/current/region_index.json
	jq -r '.regions[].regionCode' $< | xargs | awk '{ print "REGIONS = " $$0 }' > $@

work:
	mkdir -p work

work/%.ec2: offers/v1.0/aws/AmazonEC2/current/region_index.json | work
	$(MAKE) $(shell jq -r '.regions["$*"].currentVersionUrl' $< | cut -b2-)
	cp -a $(shell jq -r '.regions["$*"].currentVersionUrl' $< | cut -b2-) $@

work/%.json: preprocess.js work/%.ec2
	node $^ > $@

data:
	mkdir -p data

data/ec2-%.json: work/%.json | data
	jq -c 'del(.types,.options)' $< > $@

data/options.json: merge.js $(addsuffix .json,$(addprefix work/,$(REGIONS)))
	node $^ > $@
