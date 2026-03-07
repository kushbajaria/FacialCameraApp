# How to Run
## Install JS Dependencies
cd ~/FacialCamera

npm install @react-navigation/native @react-navigation/bottom-tabs react-native-screens react-native-safe-area-context axios

## Install react-native screens
cd ~/FacialCamera

npm install react-native-screens@3.29.0 --save

## Install Pods
cd FacialCamera/ios

pod install

cd ..

## Start Metro (one terminal)
In one terminal:
                 
                 cd FacialCamera

                 nvm use 20

                 npx react-native run-ios --simulator "iPhone 17 Pro"
                 
## Build and run (second terminal)
cd ~/FacialCamera

nvm use 20

npx react-native run-ios --simulator "iPhone 17 Pro"
