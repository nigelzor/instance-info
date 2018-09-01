.PHONY: all
all: data/ec2.json

offers/v1.0/aws/AmazonEC2/current/index.json:
	wget --compression=auto -N -r -nH https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/index.json

data:
	mkdir -p data

data/ec2.json: preprocess.js offers/v1.0/aws/AmazonEC2/current/index.json | data
	./preprocess.js

