![Alt text](assets/images/xlarge.png?raw=true "dimmy")


# Dimmy App for Homey

## Why Use Dimmy?

# dimmy

![Alt text](assets/images/xlarge.png?raw=true "dimmy")

The **Dimmy** app is an essential tool for anyone looking to enhance control over their smart lighting system. Whether you want to automate lighting based on ambient conditions, create smooth transitions between brightness levels, or add blinking effects for notifications, Dimmy offers a powerful and flexible solution. 

Dimmy was developed to address a limitation with the **Homey integration via Matter to the Hue Bridge**, where the native **duration** feature is not supported. This app fills that gap, allowing users to regain control over smooth transitions and other advanced lighting functions. 

While **Dimmy** works seamlessly with **Homey Pro 2023 and higher**, and has been tested primarily with Hue devices via Matter, other protocols such as **Zigbee** or **Z-Wave** may offer different levels of compatibility. However, we have not extensively tested these protocols, and your experience may vary depending on the devices and integrations in use.
---

## Available Features

### [Adjust Brightness and Temperature Based on LUX Over Time](https://github.com/robiebab/dimmy/wiki/Adjust-Brightness-and-Temperature-Based-on-LUX-Over-Time)
This feature allows you to dynamically adjust both brightness and color temperature based on the current LUX levels in the room. As the

---

## Available Features

### [Adjust Brightness and Temperature Based on LUX Over Time](https://github.com/robiebab/dimmy/wiki/Adjust-Brightness-and-Temperature-Based-on-LUX-Over-Time)
This feature allows you to dynamically adjust both brightness and color temperature based on the current LUX levels in the room. As the ambient light changes, the lighting adjusts to maintain the desired brightness and color warmth.

- Control both brightness and color temperature.
- Configure the transition duration.
- Adjust based on ambient light levels.

### [Adjust Brightness Based on LUX Over Time](https://github.com/robiebab/dimmy/wiki/Adjust-Brightness-Based-on-LUX-Over-Time)
With this feature, you can automatically adjust the brightness of your lights based on the ambient LUX levels, ensuring your home lighting adapts to the natural light throughout the day.

- Set minimum and maximum brightness values.
- Adjust based on LUX thresholds.
- Smooth transition over a set duration.

### [Blink Light with Dimming](https://github.com/robiebab/dimmy/wiki/Blink-Light-with-Dimming)
Create a blinking effect with your dimmable lights, with smooth transitions in and out of brightness. This feature is ideal for visual notifications or creating ambiance.

- Configure blink interval and number of blinks.
- Smooth dimming effect for each blink.
- Restore the original light state after blinking.

### [Change Brightness and Temperature Over Duration](https://github.com/robiebab/dimmy/wiki/Change-Brightness-and-Temperature-Over-Duration)
This feature allows you to smoothly change both brightness and color temperature of your lights over a specified time period. Perfect for creating lighting scenes that gradually change the mood of a room.

- Adjust both brightness and color temperature.
- Set the duration of the transition.
- Works with individual lights or entire zones.

### [Change Brightness Over Duration](https://github.com/robiebab/dimmy/wiki/Change-Brightness-Over-Duration)
Easily set the brightness of your lights to change gradually over time. This feature is useful for creating smooth transitions, like dimming the lights as you go to sleep or gradually brightening them in the morning.

- Set brightness to change over a user-defined duration.
- Works with both individual devices and zones.
- Smooth brightness transitions.

---

## How to Use

Each feature is available as a **Flow Action Card** in Homey, which you can add to your existing flows or create new flows to control your lights. For detailed instructions on how to set up each feature, click on the links above to access the specific documentation page.

Whether you're looking to automate your home lighting based on LUX values or create more sophisticated lighting scenes, the **Dimmy** app offers flexible and powerful control over your smart lights.

---

## Feedback and Support

If you encounter any issues or have feedback about the Dimmy app, feel free to create an issue in the [GitHub repository](https://github.com/robiebab/dimmy/issues). We welcome your input and will do our best to address any concerns.

[![Buy Me a Coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://www.buymeacoffee.com/robiebab)
