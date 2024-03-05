.DELETE_ON_ERROR:
.SUFFIXES:

include Makefile.regions

# fetch a subset of regions this for faster iteration
#REGIONS := ca-central-1

ALL_DATA = $(addsuffix .json,$(addprefix packages/webapp/public/data/ec2-,$(REGIONS)))

.PHONY: all
all: packages/webapp/public/data/options.json $(ALL_DATA)

Makefile.regions: packages/webapp/public/data/regions.json
	jq -r '.[].regionCode' $< | xargs | awk '{ print "REGIONS := " $$0 }' > $@

work:
	mkdir -p work

.PRECIOUS: work/%.ec2
work/%.ec2: | work
	aws pricing get-products --region us-east-1 --service AmazonEC2 --filters \
		Type=TERM_MATCH,Field=regionCode,Value=$* \
		Type=TERM_MATCH,Field=tenancy,Value=shared \
		Type=TERM_MATCH,Field=operation,Value=RunInstances \
		Type=TERM_MATCH,Field=capacitystatus,Value=Used \
		--query 'PriceList[].[@]' --output text > $@

.PRECIOUS: work/%.ecs
work/%.ecs: | work
	aws pricing get-products --region us-east-1 --service AmazonECS --filters \
		Type=TERM_MATCH,Field=regionCode,Value=$* \
		--query 'PriceList[].[@]' --output text > $@

work/ec2-%.json: packages/preprocess/src/preprocess.js work/%.ec2 work/%.ecs
	node $^ > $@

packages/webapp/public/data:
	mkdir -p packages/webapp/public/data

packages/webapp/public/data/regions.json: packages/preprocess/src/fetch-regions.js | packages/webapp/public/data
	node $^ > $@

packages/webapp/public/data/ec2-%.json: work/ec2-%.json | packages/webapp/public/data
	jq -c 'del(.types,.options)' $< > $@

packages/webapp/public/data/options.json: packages/preprocess/src/merge.js $(addsuffix .json,$(addprefix work/ec2-,$(REGIONS))) | packages/webapp/public/data
	node $^ > $@
