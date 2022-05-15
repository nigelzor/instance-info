.DELETE_ON_ERROR:
.SUFFIXES:

include Makefile.regions

ALL_DATA = $(addsuffix .json,$(addprefix public/data/ec2-,$(REGIONS)))

.PHONY: all
all: public/data/options.json $(ALL_DATA)

offers/%:
	wget --compression=auto -N -r -nH https://pricing.us-east-1.amazonaws.com/offers/$*

.PHONY: all-offers
all-offers:
	wget --compression=auto -N -r -nH https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/region_index.json
	jq -r '.regions[]|("https://pricing.us-east-1.amazonaws.com" + .currentVersionUrl)' offers/v1.0/aws/AmazonEC2/current/region_index.json | xargs wget --compression=auto -N -r -nH

Makefile.regions: offers/v1.0/aws/AmazonEC2/current/region_index.json
	jq -r '.regions[].regionCode' $< | xargs | awk '{ print "REGIONS = " $$0 }' > $@

work:
	mkdir -p work

work/%.ec2: offers/v1.0/aws/AmazonEC2/current/region_index.json | work
	$(MAKE) $(shell jq -r '.regions["$*"].currentVersionUrl' $< | cut -b2-)
	cp -a $(shell jq -r '.regions["$*"].currentVersionUrl' $< | cut -b2-) $@

work/%.json: preprocess.js work/%.ec2
	node $^ > $@

public/data:
	mkdir -p public/data

public/data/ec2-%.json: work/%.json | public/data
	jq -c 'del(.types,.options)' $< > $@

public/data/options.json: merge.js $(addsuffix .json,$(addprefix work/,$(REGIONS)))
	node $^ > $@
